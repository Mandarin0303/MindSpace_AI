import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../firebase';

// ----- 뒤척임 감지 파라미터 -----
const MOTION_THRESHOLD = 1.8;
const MOTION_COOLDOWN_MS = 5000;   //뒤척임 후 재감지 대기 (5초)
const STARTUP_COOLDOWN_MS = 5000;   // 수면 시작 직후 오감지 방지 (5초)

// ----- 바이노럴 비트 설정 -----
const BINAURAL_BASE_FREQ = 200;     // 기준 주파수(Hz)
const DELTA_BEAT_FREQ = 2;          // 수면 유지용 (델타파 2Hz)
const THETA_BEAT_FREQ = 4;          // 재입면 유도용 (세타파 4Hz)

// ----- 볼륨 제어 설정 -----
const VOLUME_NORMAL = 0.4;              // 수면 시작 시 볼륨
const VOLUME_SLEEP = 0.1;               // 잠든 것으로 판단 시 볼륨 (작게)
const VOLUME_MOTION = 0.8;             // 뒤척임 감지 시 볼륨 (크게)
const VOLUME_FADE_SEC = 1.5;       // 일반 볼륨 전환 시간
const VOLUME_FADEIN_SEC = 5.0;     // 수면 시작 시 서서히 커지는 시간(초) vr->모바일

// ----- 타이머 -----
const SLEEP_DETECT_TIMEOUT = 6000;     // 6초 가만히 있으면 잠든 것으로 판단



export function useSleepMode() {

    // ----- 외부에 노출할 상태 -----
    const [isSleepMode, setIsSleepMode] = useState(false);
    const [motionCount, setMotionCount] = useState(0);      // 뒤척임 감지 횟수
    const [sleepStatus, setSleepStatus] = useState('idle'); // idle | sleeping | motion_detected

    // ----- 오디오 -----
    const audioCtxRef = useRef(null);       // Web Audio Context (바이노럴용)
    const bgmHtmlRef = useRef(null);        // VR에서 이어받은 BGM(HTML Audio)
    const silentAudioRef = useRef(null);    // iOS 백그라운드 유지용 무음 오디오

    // 바이노럴 비트 노드
    const oscLeftRef = useRef(null);        // 바이노럴 좌채널 oscillator
    const oscRightRef = useRef(null);       // 바이노럴 우채널 oscillator
    const binauralGainRef = useRef(null);   // 바이노럴 볼륨 제어 노드

    // ----- 볼륨 페이드 -----
    const volumeFadeIntervalRef = useRef(null);

    // 기타
    const prevAccelRef = useRef({ x: 0, y: 0, z: 0 });
    const motionCooldownRef = useRef(false);
    const sleepDetectTimerRef = useRef(null);
    const isSleepModeRef = useRef(false);   // devicemotion 핸들러용 최신값
    const currentBgmUrlRef = useRef(null);  // 현재 재생 중인 BGM URL
    const wakeLockRef = useRef(null);

    // ----- AudioContext 초기화 -----
    // 반드시 사용자 제스처(버튼 클릭) 내에서 호출해야 iOS에서 동작
    const initAudioContext = useCallback(() => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`[useSleepMode] AudioContext 생성`);
        }
    }, []);

    // iOS 백그라운드 생존 트릭: 무음 <audio>루프 시작 - Web Audio API를 백그라운드에서 죽이지 않음
    const startSilentAudio = useCallback(() => {
        if (silentAudioRef.current) return;
        try {
            const audio = new Audio('/sounds/silent.mp3');
            audio.loop = true;
            audio.volume = 0.001;
            audio.play().catch(() => { });
            silentAudioRef.current = audio;
            console.log('[useSleepMode] 무음 오디오 시작 (iOS 백그라운드 유지)');
        } catch (e) {
            console.warn('[useSleepMode] 무음 오디오 실패:', e);
        }
    }, []);

    const stopSilentAudio = useCallback(() => {
        if (silentAudioRef.current) {
            silentAudioRef.current.pause();
            silentAudioRef.current = null;
        }
    }, []);

    // ----- BGM 볼륨 페이드 (HTML Audio) -----
    const setBgmVolume = useCallback((targetVolume, duration = VOLUME_FADE_SEC) => {
        if (!bgmHtmlRef.current) return;

        if (volumeFadeIntervalRef.current) {
            clearInterval(volumeFadeIntervalRef.current);
            volumeFadeIntervalRef.current = null;
        }

        const audio = bgmHtmlRef.current;
        const startVol = audio.volume;
        const endVol = Math.max(0, Math.min(1, targetVolume));
        const steps = 30;
        const stepTime = (duration * 1000) / steps;
        let step = 0;

        volumeFadeIntervalRef.current = setInterval(() => {
            step++;
            audio.volume = startVol + (endVol - startVol) * (step / steps);
            if (step >= steps) {
                audio.volume = endVol;
                clearInterval(volumeFadeIntervalRef.current);
                volumeFadeIntervalRef.current = null;
            }
        }, stepTime);
        console.log(`[useSleepMode] BGM 볼륨 -> ${targetVolume} (${duration}초)`);
    }, []);

    // ----- VR BGM 재생 (Firebase에서 받은 URL로)
    // 핵심: silentAudio는 절대 건드리지 않음!
    // bgmHtmlRef(버튼 클릭 시 미리 만든 Audio)의 src만 교체 -> iOS 재생 권한 유지
    const playBgm = useCallback((url, volume = VOLUME_NORMAL) => {
        console.log('[playBgm] 진입, url:', url);
        try {
            // 같은 URL이고 실제로 재생 중이면 볼륨만 조정
            if (bgmHtmlRef.current && currentBgmUrlRef.current === url && !bgmHtmlRef.current.paused && bgmHtmlRef.current.src.includes(url)) {
                console.log('[playBgm] 같은 URL - 볼륨만 조정');
                setBgmVolume(volume);
                return;
            }

            // bgmHtmlRef 없으면 경고 (prepareSleepMode 먼저 호출 필요)
            if (!bgmHtmlRef.current) {
                console.warn('[playBgm] bgmHtmlRef 없음 - 수면 준비 버튼을 먼저 눌러주세요');
                return;
            }

            // 기존 재생 중이면 정지
            bgmHtmlRef.current.pause();

            // src만 교체 (Audio 객체 재사용 - iOS 재생 권한 유지!)
            const audio = bgmHtmlRef.current;
            audio.src = url;
            audio.loop = true;
            audio.volume = 0;
            currentBgmUrlRef.current = url;
            console.log('[playBgm] src 교체 완료:', url);

            // MediaSession API 등록 - iOS가 '음악 앱'으로 인식 -> 화면 꺼져도 재생 유지
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: '수면 음악',
                    artist: 'MindSpace VR',
                    album: '수면 모드',
                });
                navigator.mediaSession.setActionHandler('play', () => {
                    audio.play().catch(() => { });
                });
                navigator.mediaSession.setActionHandler('pause', () => {
                    audio.pause();
                });
            }

            audio.play()
                .then(() => {
                    setBgmVolume(volume, VOLUME_FADEIN_SEC);
                    console.log(`[useSleepMode] VR BGM 재생: ${url}`);
                    console.log(`[playBgm] 재생 후 볼륨: ${audio.volume}, paused: ${audio.paused}`);
                })
                .catch(e => console.warn('[useSleepMode] BGM 재생 실패: ', e));
        } catch (e) {
            console.warn('[useSleepMode] BGM 초기화 실패: ', e);
        }
    }, [setBgmVolume]);

    // ----- 바이노럴 비트 (주파수 / Web Audio) -----
    // 뇌가 두 주파수 차이를 인식 -> 해당 뇌파 동조
    // 이미 실행 중이면 stop/start 없이 주파수 볼륨만 변경 -> 음악 끊김 없음

    // 바이노럴 볼륨 조절(외부 호출 가능)
    const setBinauralVolume = useCallback((volume) => {
        if (!binauralGainRef.current || !audioCtxRef.current) return;
        if (!isFinite(volume) || volume < 0) return;
        const now = audioCtxRef.current.currentTime;
        binauralGainRef.current.gain.cancelScheduledValues(now);
        binauralGainRef.current.gain.setValueAtTime(binauralGainRef.current.gain.value, now);
        binauralGainRef.current.gain.linearRampToValueAtTime(volume, now + VOLUME_FADE_SEC);
    }, []);

    const startBinauralBeat = useCallback((beatFreq = DELTA_BEAT_FREQ, volume = 0.2) => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;
        const now = ctx.currentTime;

        // 이미 실행 중이면 주파수/볼륨만 부드럽게 변경
        if (oscLeftRef.current && oscRightRef.current && binauralGainRef.current) {
            oscRightRef.current.frequency.cancelScheduledValues(now);
            oscRightRef.current.frequency.setValueAtTime(oscRightRef.current.frequency.value, now);
            oscRightRef.current.frequency.linearRampToValueAtTime(BINAURAL_BASE_FREQ + beatFreq, now + 2.0);
            setBinauralVolume(volume);
            console.log(`[useSleepMode] 바이노럴 전환: ${beatFreq}Hz`);
            return;
        }

        // 최초 시작 시에만 노드 생성
        const merger = ctx.createChannelMerger(2);
        binauralGainRef.current = ctx.createGain();
        binauralGainRef.current.gain.value = volume;

        oscLeftRef.current = ctx.createOscillator();
        oscLeftRef.current.type = 'sine';
        oscLeftRef.current.frequency.value = BINAURAL_BASE_FREQ;

        oscRightRef.current = ctx.createOscillator();
        oscRightRef.current.type = 'sine';
        oscRightRef.current.frequency.value = BINAURAL_BASE_FREQ + beatFreq;

        const leftGain = ctx.createGain();
        const rightGain = ctx.createGain();
        leftGain.gain.value = rightGain.gain.value = 1;

        oscLeftRef.current.connect(leftGain);
        oscRightRef.current.connect(rightGain);
        leftGain.connect(merger, 0, 0);     // 좌채널
        rightGain.connect(merger, 0, 1);    // 우채널
        merger.connect(binauralGainRef.current);
        binauralGainRef.current.connect(ctx.destination);

        oscLeftRef.current.start();
        oscRightRef.current.start();

        console.log(`[useSleepMode] 바이노럴 비트 시작: ${BINAURAL_BASE_FREQ}Hz /  ${BINAURAL_BASE_FREQ + beatFreq}Hz (${beatFreq}Hz 차이)`);
    }, [setBinauralVolume]);

    // ----- 바이노럴 비트 정지 -----
    const stopBinauralBeat = useCallback(() => {
        if (oscLeftRef.current) { try { oscLeftRef.current.stop(); } catch (_) { } oscLeftRef.current = null; }
        if (oscRightRef.current) { try { oscRightRef.current.stop(); } catch (_) { } oscRightRef.current = null; }
        binauralGainRef.current = null;
        console.log('[useSleepMode] 바이노럴 비트 정지');
    }, []);

   
    // ----- 모든 오디오 정지 ------
    const stopAllAudio = useCallback(() => {
        if (bgmHtmlRef.current) {
            bgmHtmlRef.current.pause();
            bgmHtmlRef.current.src = '';
            bgmHtmlRef.current = null;
        }
        currentBgmUrlRef.current = null;
        if (volumeFadeIntervalRef.current) {
            clearInterval(volumeFadeIntervalRef.current);
            volumeFadeIntervalRef.current = null;
        }
        stopBinauralBeat();
        stopSilentAudio();
        console.log('[useSleepMode] 모든 오디오 정지');
    }, [stopBinauralBeat, stopSilentAudio]);

    // 수면음악 토글 버튼 제어
    const pauseBgm = useCallback(() => {
        if (bgmHtmlRef.current) {
            bgmHtmlRef.current.pause();
            console.log('[useSleepMode] BGM 일시정지');
        }
    }, []);

    const resumeBgm = useCallback(() => {
        if (bgmHtmlRef.current && bgmHtmlRef.current.src) {
            bgmHtmlRef.current.play().cathch(() => { });
            console.log('[useSleepMode] BGM 재개');
        }
    }, []);

    // 깊은 수면 판단 타이머
    const startSleepDetectTimer = useCallback((onSleep) => {
        if (sleepDetectTimerRef.current) {
            clearTimeout(sleepDetectTimerRef.current);
        }
        sleepDetectTimerRef.current = setTimeout(() => {
            if (isSleepModeRef.current) {
                onSleep();
            }
            sleepDetectTimerRef.current = null;
        }, SLEEP_DETECT_TIMEOUT);
        console.log('[useSleepMode] 수면 감지 타이머 시작 (6초)');
    }, []);

    // ------ 뒤척임 감지 핸들러 -----
    // 뒤척임 -> 볼륨 UP -> 30초 잠잠하면 DOWN
    const handleDeviceMotion = useCallback((event) => {
        if (!isSleepModeRef.current || motionCooldownRef.current) return;

        const accel = event.accelerationIncludingGravity;
        if (!accel) return;

        const dx = (accel.x || 0) - prevAccelRef.current.x;
        const dy = (accel.y || 0) - prevAccelRef.current.y;
        const dz = (accel.z || 0) - prevAccelRef.current.z;
        const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
        prevAccelRef.current = { x: accel.x || 0, y: accel.y || 0, z: accel.z || 0 };

        if (delta > MOTION_THRESHOLD) {
            console.log(`[useSleepMode] 뒤척임 감지! delta=${delta.toFixed(2)}`);

            // Firebase에 로그 기록
            const newLogRef = ref(db, 'sleepLog/' + Date.now());
            set(newLogRef, {
                timestamp: Date.now(),
                motionDelta: delta.toFixed(2),
                status: 'motion_dextexted'
            });

            // 상태 업데이트
            setMotionCount(prev => prev + 1);
            setSleepStatus('motion_detected');
            set(ref(db, 'status/lastMotionTime'), Date.now());

            // VR 이어진 BGM + 바이노럴 볼륨 UP
            setBgmVolume(VOLUME_MOTION);
            setBinauralVolume(0.5);
            startBinauralBeat(THETA_BEAT_FREQ, 0.5);  // 세타파로 전환(재입면 유도)

            // 뒤척임 후 30초 가만히 있으면 다시 잠든 것으로 판단 -> 볼륨 DOWN
            startSleepDetectTimer(() => {
                setBgmVolume(VOLUME_SLEEP);
                setBinauralVolume(0.1);
                startBinauralBeat(DELTA_BEAT_FREQ, 0.1);    // 델타파 복귀
                setSleepStatus('deeply_sleeping');
                console.log('[useSleepMode] 뒤척임 후 30초 잠잠 -> 다시 잠든 것으로 판단, 불륨 DOWN, 델타파 복귀');
            });

            motionCooldownRef.current = true;
            setTimeout(() => {
                motionCooldownRef.current = false;
                console.log('[useSleepMode] 뒤척임 쿨다운 해제');
            }, MOTION_COOLDOWN_MS);
        }
    }, [setBgmVolume, setBinauralVolume, startBinauralBeat, startSleepDetectTimer]);
    
    // ----- 뒤척임 감지 시작 (iOS 권한 포함) -----
    const startMotionDetection = useCallback(() => {
        if (typeof DeviceMotionEvent === 'undefined') {
            console.warn('[useSleepMode] DeviceMotionEvent 미지원 기기');
            return;
        }

        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            // ios 13+ 권한 요청
            DeviceMotionEvent.requestPermission()
                .then(permission => {
                    if (permission === 'granted') {
                        window.addEventListener('devicemotion', handleDeviceMotion);
                        console.log('[useSleepMode] DeviceMotion 권한 획득(ios)');
                    } else {
                        console.warn('[useSleepMode] DeviceMotion 권한 거부');
                    }
                })
                .catch(console.error);
        } else {
            // Android / 기타
            window.addEventListener('devicemotion', handleDeviceMotion);
            console.log('[useSleepMode] DeviceMotion 감지 시작 (Android)');
        }
    }, [handleDeviceMotion]);

    // 화면 꺼짐/켜짐 처리
    // - iOS : 무음 <audio>가 Web Audio를 살려주므로 resume() 불필요
    // - Android : suspended 상태가 될 수 있으므로 resume() 호출
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (!isSleepModeRef.current) return;

            if (document.visibilityState === 'visible') {
                console.log('[useSleepMode] 화면 복귀');

                // Android: AudioContext suspended 복구
                if (audioCtxRef.current?.state === 'suspended') {
                    try {
                        await audioCtxRef.current.resume(); } catch (_) { }
                }
                // BGM 끊겼으면 재시작 (src 교체 없이 play()만!)
                if (bgmHtmlRef.current?.paused) {
                    bgmHtmlRef.current.play().catch(() => { });
                }

                // silentAudio 끊겼으면 재시작
                if (silentAudioRef.current?.paused) {
                    silentAudioRef.current.play().catch(() => { });
                }

                // Wake Lock 재획득 (화면 켜질 때 다시 잠금)
                try {
                    if ('wakeLock' in navigator && !wakeLockRef.current) {
                        wakeLockRef.current = await navigator.wakeLock.request('screen');
                        console.log('[useSleepMode] Wake Lock 재획득');
                    }
                } catch (_) { }

            } else {
                console.log(`[useSleepMode] 화면 꺼짐 - BGM: ${bgmHtmlRef.current?.paused ? '중단' : '재생중'} / silentAudio: ${silentAudioRef.current?.paused?'중단':'재생중'}`);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [playBgm]);

    // ----- 수면 준비 (버튼 클릭용)-AudioContext만 초기화하고 Firebase 신호 대기 -----
    // 버튼 클릭 시점에 BGM Audio 미리 생성 -> iOS 재생 권한 획득
    // silentAudio는 별도로 항상 유지 -> Web Audio 화면 꺼져도 생존
    const prepareSleepMode = useCallback(async () => {
        if (isSleepModeRef.current) return;

        // 기존 BGM 정리
        if (bgmHtmlRef.current) {
            bgmHtmlRef.current.pause();
            bgmHtmlRef.current = null;
        }

        // BGM 전용 Audio 미리 생성 (iOS 재생 권한 획득)
        const bgmAudio = new Audio();
        bgmAudio.loop = true;
        bgmAudio.volume = 0;
        bgmAudio.play().then(() => bgmAudio.pause()).catch(() => { });
        bgmHtmlRef.current = bgmAudio;
        currentBgmUrlRef.current = null;    // 이전 세션 URL 초기화
        console.log('[useSleepMode] BGM Audio 미리 생성 완료 (iOS 재생 권한 획득');

        // iOS : DeviceMotion 권한 요청 (사용자 제스처 내에서 해야 함)
        startMotionDetection();

        // AudioContext 초기화 (사용자 제스처 내에서만 iOS 허용)
        initAudioContext();

        //iOS 백그라운드 트릭 시작, silentAudio는 BGM과 별도로 항상 유지!
        startSilentAudio();

        if (audioCtxRef.current?.state === 'suspended') {
            await audioCtxRef.current.resume();
        }

        console.log('[useSleepMode] 수면 준비 완료 - VR 기기 탈착 신호 대기 중...');
        setSleepStatus('waiting');
    }, [initAudioContext, startMotionDetection, startSilentAudio]);

    // ----- 수면 모드 진입 (외부 호출 또는 Firebase 신호) -----
    const startSleepMode = useCallback(async (bgmUrl) => {
        if (isSleepModeRef.current) return;

        // 수면 버튼 누르기 전, 후 5초간 감지 센서 방지 및 정지.
        motionCooldownRef.current = true;
        setTimeout(() => {
            motionCooldownRef.current = false;
            console.log('[useSleepMode] 시작 쿨다운 해제 -> 뒤척임 감지 시작');
        }, STARTUP_COOLDOWN_MS);

        // BGM 재생 (bgmHtmlRef는 prepareSleepMode에서 이미 생성됨, src만 교체)
        if (bgmUrl) {
            console.log('[startSleepMode] playBgm 호출 시도:', bgmUrl);
            playBgm(bgmUrl, VOLUME_NORMAL);
        } else {
            console.warn('[useSleepMode] bgmUrl 없음');
        }

        if (audioCtxRef.current?.state === 'suspended') {
            await audioCtxRef.current.resume();
        }

        isSleepModeRef.current = true;
        setIsSleepMode(true);
        setSleepStatus('sleeping');

        startBinauralBeat(DELTA_BEAT_FREQ, 0);
        setTimeout(() => setBinauralVolume(0.2), 300);

        startSleepDetectTimer(() => {
            setBgmVolume(VOLUME_SLEEP);
            setBinauralVolume(0.1);
            setSleepStatus('deeply_sleeping');
            console.log('[useSleepMode] 6초 가만히 -> 잠든 것으로 판단, 볼륨 DOWN');
        });

        set(ref(db, 'status/sleepStartTime'), Date.now());
        console.log('[useSleepMode] 수면 모드 시작');

        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                console.log('[useSleepMode] Wake Lock 획득 - 화면 유지');
                wakeLockRef.current.addEventListener('release', () => {
                    console.log('[useSleepMode] Wake Lock 해제됨');
                });
            }
        } catch (e) {
            console.warn('[useSleepMode] Wake Lock 실패(iOS 미지원)', e);
        }

        // Firebase 상태 기록
        set(ref(db, 'status/sleepStartTime'), Date.now());
        console.log('[useSleepMode] 수면 모드 시작');


    }, [playBgm, startBinauralBeat, startSleepDetectTimer, setBgmVolume, setBinauralVolume]);

    // ----- 수면 모드 종료 -----
    const stopSleepMode = useCallback(() => {
        if (!isSleepModeRef.current) return;

        isSleepModeRef.current = false;
        setIsSleepMode(false);
        setSleepStatus('idle');

        if (sleepDetectTimerRef.current) {
            clearTimeout(sleepDetectTimerRef.current);
            sleepDetectTimerRef.current = null;
        }

        stopAllAudio();
        window.removeEventListener('devicemotion', handleDeviceMotion);

        if (wakeLockRef.current && !wakeLockRef.current.released) {
            wakeLockRef.current.release();
            wakeLockRef.current = null;
        }

        set(ref(db, 'status/sleepMusicStart'), false);
        console.log('[useSleepMode] 수면 모드 종료');
    }, [stopAllAudio, handleDeviceMotion]);

    // ----- Firebase 신호 감시 -----
    // VR -> sleepMusicStart = true & bgmUrl 쓰면 자동 수면 모드 진입
    useEffect(() => {
        // sleepMusicStart 감시
        const unsubscribe = onValue(ref(db, 'status/sleepMusicStart'), (snapshot) => {
            const shouldStart = snapshot.val();
            console.log(`[useSleepMode] Firebase sleepMusicStart: ${shouldStart}`);

            if (shouldStart === true && !isSleepModeRef.current) {
                // AudioContext가 생성된 경우에만 자동 시작 가능.
                // 최초 진입은 반드시 버튼으로 AudioContext 생성 필요 (iOS 정책)

                // 사용자가 이미 버튼을 눌러서 오디오 컨텍스트가 활성화되어 있다면 자동 재생 시도
                if (audioCtxRef.current) {
                    //bgmUrl은 별도 리스너에서 currentBgmUrlRef에 저장되어 있음
                    //SleepMusicStart보다 bgmUrl이 먼저 올수도 있으믈 약간 딜레이 후 시도
                    setTimeout(() => {
                        startSleepMode(currentBgmUrlRef.current);
                        console.log(`[useSleepMode] 자동 수면 모드 시작, bgmUrl: ${currentBgmUrlRef.current}`);
                    }, 500);
                } else {
                    console.warn('[useSleepMode] AudioContext 미생성 - 수면 준비 버튼을 먼저 눌러주세요.');
                }
            } else if (shouldStart === false && isSleepModeRef.current) {
                stopSleepMode();
            }
        });

        // bgmUrl 감시 - VR 씬 BGM 변경 시 모바일도 교체
        const unsubBgm = onValue(ref(db, 'status/bgmUrl'), (snapshot) => {
            const bgmUrl = snapshot.val();
            if (!bgmUrl) return;

            currentBgmUrlRef.current = bgmUrl;
            console.log(`[useSleepMode] Firebase bgmUrl: ${bgmUrl}`);

            // 수면 모드 중에 씬이 바뀌면 BGM 교체
            if (isSleepModeRef.current) {
                playBgm(bgmUrl, VOLUME_NORMAL);
            }
        });

        // 컴포넌트 언마운트 시 Firebase 리스너 해제
        return () => {
            unsubscribe(); unsubBgm();
        };

    }, [startSleepMode, stopSleepMode, playBgm]);

    // ----- 컴포넌트 언마운트 시 정리 -----
    useEffect(() => {
        return () => {
            if (sleepDetectTimerRef.current) { 
                clearTimeout(sleepDetectTimerRef.current); 
            }
            if (volumeFadeIntervalRef.current) {
                clearInterval(volumeFadeIntervalRef.current);
            }
            stopAllAudio();
            window.removeEventListener('devicemotion', handleDeviceMotion);
            if (wakeLockRef.current && !wakeLockRef.current.released) {
                wakeLockRef.current.release();
            }
            if (audioCtxRef.current) {
                audioCtxRef.current.close();
            }
        }; 
    }, [stopAllAudio, handleDeviceMotion]);

    // ----- 혹 반환값 -----
    return {
        isSleepMode,    // boolean - 현재 수면 모드 여부
        sleepStatus,    // string - 'idle'|'sleeping'|'motion_detected'
        motionCount,    // number - 뒤척임 감지 총 횟수
        prepareSleepMode,   // 버튼 클릭용 - AudioContext 초기화 + 대기
        startSleepMode, // () => void - 버튼 onClick 등에 연결 , Firebase 신호 또는 내부 자동 호출용
        stopSleepMode,  // () => void - 수동 종료 시
        setBinauralVolume,  // 바이노럴 볼륨 조절 (0.0~1.0)
        setBgmVolume,   // 외부에서 수동 볼륨 조절 시
        pauseBgm,
        resumeBgm,
    };
} 