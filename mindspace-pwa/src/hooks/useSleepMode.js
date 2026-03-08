import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../firebase';

// ----- 뒤척임 감지 파라미터 -----
const MOTION_THRESHOLD = 1.8;
const MOTION_COOLDOWN_MS = 15000;
const SLEEP_MUSIC_URL = '/sounds/sleep_music.mp3';
const REINDUCTION_SOUND_URL = '/sounds/reinduction_binaural.mp3';

// iOS 백그라운드 유지용 무음 오디오(base64 인토딩된 최소 무음 mp3)
const SILENT_AUDIO_SRC = '/sounds/silent.mp3';

// ----- 바이노럴 비트 설정 -----
const BINAURAL_BASE_FREQ = 200;
const DELTA_BEAT_FREQ = 2;
const THETA_BEAT_FREQ = 4;

// ----- 볼륨 제어 설정 -----
const VOLUME_NORMAL = 0.4;  // 평상시 수면 음악 볼륨
const VOLUME_MOTION = 0.85; // 뒤척임 감지 시 올릴 볼륨
const VOLUME_FADE_DURATION = 1.5;   // 볼륨 번화 소요 시간(초)
const MOTION_QUIET_TIMEOUT = 30000;  // 30초 잠잠하면 볼륨 다시 낮춤

// ------------------------------
export function useSleepMode() {

    // ----- 외부에 노출할 상태 -----
    const [isSleepMode, setIsSleepMode] = useState(false);
    const [motionCount, setMotionCount] = useState(0);   // 뒤척임 감지 횟수
    const [sleepStatus, setSleepStatus] = useState('idle');
    // idle | sleeping | motion_detected

    // ----- 내부 ref (리렌더링 없이 유지해야 하는 값) -----
    const audioCtxRef = useRef(null);

    // 바이노럴 비트 노드
    const oscLeftRef = useRef(null);
    const oscRightRef = useRef(null);
    const binauralGainRef = useRef(null);

    // 배경음 노드 & GainNode(볼륨 제어용으로 분리 저장)
    const sleepMusicNodeRef = useRef(null);
    const sleepMusicGainRef = useRef(null);     // 수면 음악 전용 GainNode ref
    const reinductionNodeRef = useRef(null);

    // 미리 로드된 버퍼 (ios 대응)
    const sleepMusicBufferRef = useRef(null);
    const reinductionBufferRef = useRef(null);

    // 기타
    const prevAccelRef = useRef({ x: 0, y: 0, z: 0 });
    const motionCooldownRef = useRef(false);
    const sleepStartTimeRef = useRef(null);
    const isSleepModeRef = useRef(false);   // devicemotion 핸들러에서 최신 상태 창조용
    const wakeLockRef = useRef(null);

    // 볼륨 자동 복귀 타이머 ref
    const volumeRestoreTimerRef = useRef(null);

    // iOS 백그라운드 유지용 
    const silentAudioRef = useRef(null);

    // ----- AudioContext 초기화 -----
    // 반드시 사용자 제스처(버튼 클릭) 내에서 호출해야 iOS에서 동작
    const initAudioContext = useCallback(() => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`[useSleepMode] AudioContext 생성`);
        }
    }, []);

    // iOS 백그라운드 트릭: 무음 <audio>루프 시작 - Web Audio API를 백그라운드에서 죽이지 않음
    const startSilentAudio = useCallback(() => {
        if (silentAudioRef.current) return;
        try {
            const audio = new Audio();
            audio.src = SILENT_AUDIO_SRC;
            audio.loop = true;
            audio.volume = 0.001;
            const playPromise = audio.play();
            if (playPromise !== undefined){
                playPromise
                    .then(() => console.log('[useSleepMode] 무음 오디오 재생 성공(iOS 백그라운드 유지)'))
                    .catch(e => console.warn('[useSleepMode] 무음 오디오 재생 실패:', e));
            }
            silentAudioRef.current = audio;
        } catch (e) {
            console.warn('[useSleepMode] 무음 오디오 초기화 실패:', e);
        }
    }, []);

    const stopSilentAudio = useCallback(() => {
        if (silentAudioRef.current) {
            silentAudioRef.current.pause();
            silentAudioRef.current.src = '';
            silentAudioRef.current = null;
            console.log('[useSleepMode] 무음 오디오 정지');
        }
    }, []);

    // ----- 음악 파일 미리 로드 -----
    // 버튼 클릭 직후 미리 로드해주고, 재생 시에는 버퍼만 사용
    const preloadAudio = useCallback(async () => {
        if (!audioCtxRef.current) return;
        try {
            if (!sleepMusicBufferRef.current) {
                const res = await fetch(SLEEP_MUSIC_URL);
                const buf = await res.arrayBuffer();
                sleepMusicBufferRef.current = await audioCtxRef.current.decodeAudioData(buf);
                console.log('[useSleepMode] 수면 음악 프리로드 완료');
            }
            if (!reinductionBufferRef.current) {
                const res = await fetch(REINDUCTION_SOUND_URL);
                const buf = await res.arrayBuffer();
                reinductionBufferRef.current = await audioCtxRef.current.decodeAudioData(buf);
                console.log('[useSleepMode] 재입면 사운드 프리로드 완료');
            }
        } catch (e) {
            console.warn('[useSleepMode] 오디오 프리로드 실패: ', e);
        }
    }, []);

    // ----- 바이노럴 비트 시작 -----
    // 뇌가 두 주파수 차이를 인식 -> 해당 뇌파 동조
    const startBinauralBeat = useCallback((beatFreq = DELTA_BEAT_FREQ, volume = 0.3) => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;

        // 기존 바이노럴 비트 정지
        if (oscLeftRef.current) { try { oscLeftRef.current.stop(); } catch (_) { } oscLeftRef.current = null; }
        if (oscRightRef.current) { try { oscRightRef.current.stop(); } catch (_) { } oscRightRef.current = null; }

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
    }, []);

    // ----- 바이노럴 볼륨 조절(외부 호출 가능)-----
    const setBinauralVolume = useCallback((volume) => {
        if (binauralGainRef.current && audioCtxRef.current) {
            const now = audioCtxRef.current.currentTime;
            binauralGainRef.current.gain.cancelScheduledValues(now);
            binauralGainRef.current.gain.setValueAtTime(binauralGainRef.current.gain.value, now);
            binauralGainRef.current.gain.linearRampToValueAtTime(volume, now + VOLUME_FADE_DURATION);
        }
    }, []);

    // ----- 바이노럴 비트 정지 -----
    const stopBinauralBeat = useCallback(() => {
        if (oscLeftRef.current) { try { oscLeftRef.current.stop(); } catch (_) { } oscLeftRef.current = null; }
        if (oscRightRef.current) { try { oscRightRef.current.stop(); } catch (_) { } oscRightRef.current = null; }
        console.log('[useSleepMode] 바이노럴 비트 정지');
    }, []);

    // 수면 음악 볼륨 페이드 (linearRamp으로 부드럽게)
    const setSleepMusicVolume = useCallback((targetVolume) => {
        if (!sleepMusicGainRef.current || !audioCtxRef.current) return;
        const now = audioCtxRef.current.currentTime;
        sleepMusicGainRef.current.gain.cancelScheduledValues(now);
        sleepMusicGainRef.current.gain.setValueAtTime(
            sleepMusicGainRef.current.gain.value, now
        );
        // 실제 볼륨을 바꿔주는 코드
        sleepMusicGainRef.current.gain.linearRampToValueAttTime(targetVolume, now + VOLUME_FADE_DURATION);
        console.log(`[useSleepMode] 수면 음악 볼륨 -> ${targetVolume} (${VOLUME_FADE_DURATION}초)`);
    }, []);

    // ------ 배경 수면 음악 재생 -----
    const playSleepMusic = useCallback((volume = VOLUME_NORMAL) => {
        if (!audioCtxRef.current || !sleepMusicBufferRef.current) return;
        try {
            if (sleepMusicNodeRef.current) { try { sleepMusicNodeRef.current.stop(); } catch (_) { } }

            sleepMusicNodeRef.current = audioCtxRef.current.createBufferSource();
            sleepMusicNodeRef.current.buffer = sleepMusicBufferRef.current;
            sleepMusicNodeRef.current.loop = true;

            // GainNode를 ref에 저장 -> 나중에 setSleepMusicVolume으로 제어 가능
            sleepMusicGainRef.current = audioCtxRef.current.createGain();
            sleepMusicGainRef.current.gain.value = volume;

            sleepMusicNodeRef.current.connect(sleepMusicGainRef.current);
            sleepMusicGainRef.current.connect(audioCtxRef.current.destination);
            sleepMusicNodeRef.current.start();

            console.log('[useSleepMode] 수면 음악 재생 시작');
        } catch (e) {
            console.warn('[useSleepMode] 수면 음악 재생 실패:', e);
        }
    }, []);

    // ----- 재입면 사운드 재생 (뒤척임 감지 시) ------
    const playReinductionSound = useCallback(() => {
        if (!audioCtxRef.current) return;

        // 세타파로 전환
        startBinauralBeat(THETA_BEAT_FREQ, 0.4);

        if (!reinductionBufferRef.current) return;
        try {
            // 이전 재입면 사운드 중단
            if (reinductionNodeRef.current) { try { reinductionNodeRef.current.stop(); } catch (_) { } }

            reinductionNodeRef.current = audioCtxRef.current.createBufferSource();
            reinductionNodeRef.current.buffer = reinductionBufferRef.current;
            reinductionNodeRef.current.loop = false;    //한 번만 재생

            const gain = audioCtxRef.current.createGain();
            gain.gain.value = 0.6;
            reinductionNodeRef.current.connect(gain);
            gain.connect(audioCtxRef.current.destination);
            reinductionNodeRef.current.start();

            // 재입면 사운드 종료 후 델타파로 복귀
            reinductionNodeRef.current.onended = () => {
                if (isSleepModeRef.current) {
                    startBinauralBeat(DELTA_BEAT_FREQ, 0.3);
                    console.log('[useSleepMode] 델타파 복귀');
                }
            };
            console.log('[useSleepMode] 재입면 사운드 재생 (세타파 4Hz)');
        } catch (e) {
            console.warn('[useSleepMode] 재입면 사운드 재생 실패:', e);
        }
    }, [startBinauralBeat]);

    // ----- 모든 오디오 정지 ------
    const stopAllAudio = useCallback(() => {
        stopBinauralBeat();
        if (sleepMusicNodeRef.current) {
            try { sleepMusicNodeRef.current.stop(); } catch (_) { }
            sleepMusicNodeRef.current = null;
        }
        sleepMusicGainRef.current = null;
        if (reinductionNodeRef.current) {
            try { reinductionNodeRef.current.stop(); } catch (_) { }
            reinductionNodeRef.current = null;
        }
        stopSilentAudio();
    }, [stopBinauralBeat, stopSilentAudio]);

    // ------ 뒤척임 감지 핸들러 -----
    // 뒤척임 -> 볼륨 UP -> 30초 잠잠하면 DOWN
    const handleDeviceMotion = useCallback((event) => {
        if (!isSleepModeRef.current) return;

        const accel = event.accelerationIncludingGravity;
        if (!accel) return;

        const dx = (accel.x || 0) - prevAccelRef.current.x;
        const dy = (accel.y || 0) - prevAccelRef.current.y;
        const dz = (accel.z || 0) - prevAccelRef.current.z;
        const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);

        prevAccelRef.current = { x: accel.x || 0, y: accel.y || 0, z: accel.z || 0 };

        if (delta > MOTION_THRESHOLD && !motionCooldownRef.current) {
            console.log(`[useSleepMode] 뒤척임 감지! delta=${delta.toFixed(2)}`);

            // 상태 업데이트
            setMotionCount(prev => prev + 1);
            setSleepStatus('motion_detected');
            set(ref(db, 'status/lastMotionTime'), Date.now());

            // 볼륨 올리기 (1.5초에 걸쳐 VOLUME_MOTION까지)
            setSleepMusicVolume(VOLUME_MOTION);

            // 복귀 타이머 리셋 (뒤척임이 계속되면 계속 연장됨)
            if (volumeRestoreTimerRef.current) {
                clearTimeout(volumeRestoreTimerRef.current);
            }

            // 30초 잠잠하면 볼륨 VOLUME_NORMAL로 복귀
            volumeRestoreTimerRef.current = setTimeout(() => {
                if (isSleepModeRef.current) {
                    setSleepMusicVolume(VOLUME_NORMAL);
                    setSleepStatus('sleeping');
                    console.log('[useSleepMode] 30초 잠잠 -> 볼륨 정상 복귀');
                }
                volumeRestoreTimerRef.current = null;
            }, MOTION_QUIET_TIMEOUT);

            // 재입면 사운드 재생
            motionCooldownRef.current = true;
            playReinductionSound();

            // 쿨다운 후 상태 복구
            setTimeout(() => {
                motionCooldownRef.current = false;
                console.log('[useSleepMode] 뒤척임 쿨다운 해제');
            }, MOTION_COOLDOWN_MS);
        }
    }, [playReinductionSound, setSleepMusicVolume]);

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

    // ------ 화면 잠금 방지, Wake Lock 획득 ------
    const requestWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                wakeLockRef.current.addEventListener('release', () => {
                    console.log('[useSleepMode] Wake Lock 해제됨');
                });
                console.log('[useSleepMode] Wake Lock 획득');
            } catch (e) {
                console.warn('[useSleepMode] Wake Lock 실패: ', e);
            }
        }
    }, []);

    // 화면 꺼짐/켜짐 처리
    // - iOS : 무음 <audio>가 Web Audio를 살려주므로 resume() 불필요
    // - Android : suspended 상태가 될 수 있으므로 resume() 호출
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (!isSleepModeRef.current) return;

            if (document.visibilityState === 'visible') {
                console.log('[useSleepMode] 화면 복귀');
                if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                    try {
                        await audioCtxRef.current.resume();
                        console.log('[useSleepMode] AudioContext 재개 완료 (Android)');
                    } catch (e) {
                        console.warn('[useSleepMode] AudioContext 재개 실패:', e);
                    }
                }
                if (!wakeLockRef.current || wakeLockRef.current.released) {
                    await requestWakeLock();
                }
            } else {
                console.log('[useSleepMode] 화면 꺼짐 - iOS 무음 오디오로 Web Audio 유지 중');
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [requestWakeLock]);

    // ----- 수면 모드 진입 (외부 호출 또는 Firebase 신호) -----
    const startSleepMode = useCallback(async () => {
        if (isSleepModeRef.current) return;

        // AudioContext 초기화(사용자 제스처 내에서만 ios 허용)
        initAudioContext();
        if (audioCtxRef.current.state === 'suspended') {
            await audioCtxRef.current.resume();
        }

        // 음악 파일 미리 로드 (ios 제스처 체인 유지)
        await preloadAudio();

        sleepStartTimeRef.current = Date.now();

        isSleepModeRef.current = true;
        setIsSleepMode(true);
        setSleepStatus('sleeping')

        // 뒤척임 감지 + 화면 잠금 방지 시작
        startMotionDetection();
        requestWakeLock();

        // iOS 백그라운드 트릭 시작 (사용자 제스처 체인 안에서 호출해야 iOS에서 동작)
        startSilentAudio();

        // 수면음악 + 바이노럴 비트(델타파2Hz) 동시 재생
        playSleepMusic(VOLUME_NORMAL);
        startBinauralBeat(DELTA_BEAT_FREQ, 0.3);

        // Firebase 상태 기록
        set(ref(db, 'status/sleepStartTime'), sleepStartTimeRef.current);

        console.log('[useSleepMode] 수면 모드 시작 - 델타파 바이노럴 비트 활성화');
    }, [initAudioContext, preloadAudio, playSleepMusic, startBinauralBeat, startMotionDetection, requestWakeLock, startSilentAudio]);

    // ----- 수면 모드 종료 -----
    const stopSleepMode = useCallback(() => {
        if (!isSleepModeRef.current) return;

        isSleepModeRef.current = false;
        setIsSleepMode(false);
        setSleepStatus('idle');

        // 볼륨 복귀 타이머 정리
        if (volumeRestoreTimerRef.current) {
            clearTimeout(volumeRestoreTimerRef.current);
            volumeRestoreTimerRef.current = null;
        }

        stopAllAudio();
        window.removeEventListener('devicemotion', handleDeviceMotion);

        if (wakeLockRef.current && !wakeLockRef.current.released) {
            wakeLockRef.current.release();
            wakeLockRef.current = null;
        }

        // 수면 시간 기록
        if (sleepStartTimeRef.current) {
            const durationMin = Math.round((Date.now() - sleepStartTimeRef.current) / 60000);
            set(ref(db, 'sleepLog/lastDuration'), durationMin);
            console.log(`[useSleepMode] 수면 종료 - 총 ${durationMin}분`);
        }
        set(ref(db, 'status/sleepMusicStart'), false);
    }, [stopAllAudio, handleDeviceMotion]);

    // ----- Firebase 신호 감시 ( 자동 수면 모드 진입) -----
    useEffect(() => {
        const sleepRef = ref(db, 'status/sleepMusicStart');
        const unsubscribe = onValue(sleepRef, (snapshot) => {
            const shouldStart = snapshot.val();

            console.log(`[useSleepMode] Firebase 신호 감지: ${shouldStart}`);

            if (shouldStart === true && !isSleepModeRef.current) {
                // AudioContext가 생성된 경우에만 자동 시작 가능.
                // 최초 진입은 반드시 버튼으로 AudioContext 생성 필요 (iOS 정책)

                // 사용자가 이미 버튼을 눌러서 오디오 컨텍스트가 활성화되어 있다면 자동 재생 시도
                if (audioCtxRef.current) {
                    startSleepMode();
                } else {
                    console.warn('[useSleepMode] AudioContext 미생성 - 수면 준비 버튼을 먼저 눌러주세요.');
                }
            } else if (shouldStart === false && isSleepModeRef.current) {
                stopSleepMode();
            }
        });

        // 컴포넌트 언마운트 시 Firebase 리스너 해제
        return () => unsubscribe();
    }, [startSleepMode, stopSleepMode]);

    // ----- 컴포넌트 언마운트 시 정리 -----
    useEffect(() => {
        return () => {
            if (volumeRestoreTimerRef.current) clearTimeout(volumeRestoreTimerRef.current);
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
        startSleepMode, // () => void - 버튼 onClick 등에 연결
        stopSleepMode,  // () => void - 수동 종료 시
        setBinauralVolume,  // 바이노럴 볼륨 조절 (0.0~1.0)
        startBinauralBeat,  // 바이노럴 주파수 변경 (beatFreq, volume)
        stopBinauralBeat,   // 바이노럴 비트만 정지
        setSleepMusicVolume,    // 외부에서 수동으로 볼륨 조절 필요시 사용
    };
} 