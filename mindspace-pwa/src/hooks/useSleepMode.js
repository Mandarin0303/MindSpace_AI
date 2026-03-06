import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../firebase';

// ----- 뒤척임 감지 파라미터 -----
const MOTION_THRESHOLD = 1.8;
const MOTION_COOLDOWN_MS = 15000;
const SLEEP_MUSIC_URL = '/sounds/sleep_music.mp3';
const REINDUCTION_SOUND_URL = '/sounds/reinduction_binaural.mp3';

// ----- 바이노럴 비트 설정 -----
const BINAURAL_BASE_FREQ = 200;
const DELTA_BEAT_FREQ = 2;
const THETA_BEAT_FREQ = 4;

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

    // 배경음 노드
    const sleepMusicNodeRef = useRef(null);
    const reinductionNodeRef = useRef(null);

    // 미리 로드된 버퍼 (ios 대응)
    const sleepMusicBufferRef = useRef(null);
    const reinductionBufferRef = useRef(null);

    // 기타
    const prevAccelRef = useRef({ x: 0, y: 0, z: 0 });
    const motionCooldownRef = useRef(false);
    const sleepStartTimeRef = useRef(null);
    const isSleepModeRef = useRef(false);   // devicemotion 핸들러에서 최신 상태 창조용

    // ----- AudioContext 초기화 -----
    // 반드시 사용자 제스처(버튼 클릭) 내에서 호출해야 ios에서 동작
    const initAudioContext = useCallback(() => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`[useSleepMode] AudioContext 생성`);
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
                reinductionBufferRef.current = await audioCtxRef.current.decodeAudioDate(buf);
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

        console.log(`[useSleepMode] 바이노럴 비트 시작: ${BINAURAL_BASE_FREQ}Hz /  ${BINAURAL_BASE_FREQ + beatFreq}Hz (${beatFreq}Hz 차이`);
    }, []);

    // ----- 바이노럴 볼륨 조절(외부 호출 가능)-----
    const setBinauralVolume = useCallback((volume) => {
        if (binauralGainRef.current && audioCtxRef.current) {
            binauralGainRef.current.gain.setTargetAtTime(
                volume, audioCtxRef.current.currentTime, 0.5 // 0.5초에 걸쳐 부드럽게 전환
            );
        }
    }, []);

    // ----- 바이노럴 비트 정지 -----
    const stopBinauralBeat = useCallback(() => {
        if (oscLeftRef.current) { try { oscLeftRef.current.stop(); } catch (_) { } oscLeftRef.current = null; }
        if (oscRightRef.current) { try { oscRightRef.current.stop(); } catch (_) { } oscRightRef.current = null; }
        console.log('[useSleepMode] 바이노럴 비트 정지');
    }, []);

    // 배경 수면 음악 재생
    const playSleepMusic = useCallback((volume = 0.4) => {
        if (!audioCtxRef.current || !sleepMusicBufferRef.current) return;
        try {
            if (sleepMusicNodeRef.current) { try { sleepMusicNodeRef.current.stop(); } catch (_) { } }

            sleepMusicNodeRef.current = audioCtxRef.current.createBufferSource();
            sleepMusicNodeRef.current.buffer = sleepMusicBufferRef.current;
            sleepMusicNodeRef.current.loop = true;

            const gain = audioCtxRef.current.createGain();
            gain.gain.value = volume;
            sleepMusicNodeRef.current.connect(gain);
            gain.connect(audioCtxRef.current.destination);
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
        if (reinductionNodeRef.current) {
            try { reinductionNodeRef.current.stop(); } catch (_) { }
            reinductionNodeRef.current = null;
        }
    }, [stopBinauralBeat]);

    // ------ 뒤척임 감지 핸들러 -----
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

            // 재입면 사운드 재생
            motionCooldownRef.current = true;
            playReinductionSound();

            // 쿨다운 후 상태 복구
            setTimeout(() => {
                motionCooldownRef.current = false;
                setSleepStatus('sleeping');
                console.log('[useSleepMode] 뒤척임 쿨다운 해제');
            }, MOTION_COOLDOWN_MS);
        }
    }, [playReinductionSound]);

    // ----- 뒤척임 감지 시작 (ios 권한 포함) -----
    const startMotionDetection = useCallback(() => {
        if (typeof DeviceMotionEvent === 'undefined') {
            console.warn('[useSleepMode] DeviceMotionEvent 미지원 기기');
            return;
        }

        if (typeof DeviceMotionEvent.requestPermisstion === 'function') {
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
            console.log('[useSleepMode] DeviceMotion 감지 시작');
        }
    }, [handleDeviceMotion]);

    // ------ 화면 잠금 방지 ------
    const requestWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                await navigator.wakeLock.request('screen');
                console.log('[useSleepMode] Wake Lock 획득');
            } catch (e) {
                console.warn('[useSleepMode] Wake Lock 실패: ', e);
            }
        }
    }, []);

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

        // 수면음악 + 바이노럴 비트(델타파2Hz) 동시 재생
        playSleepMusic(0.4);
        startBinauralBeat(DELTA_BEAT_FREQ, 0.3);

        // Firebase 상태 기록
        set(ref(db, 'status/sleepStartTime'), sleepStartTimeRef.current);

        console.log('[useSleepMode] 수면 모드 시작 - 델타파 바이노럴 비트 활성화');
    }, [initAudioContext, preloadAudio, playSleepMusic, startBinauralBeat, startMotionDetection, requestWakeLock]);

    // ----- 수면 모드 종료 -----
    const stopSleepMode = useCallback(() => {
        if (!isSleepModeRef.current) return;

        isSleepModeRef.current = false;
        setIsSleepMode(false);
        setSleepStatus('idle');

        stopAllAudio();
        window.removeEventListener('devicemotion', handleDeviceMotion);

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
            stopAllAudio();
            window.removeEventListener('devicemotion', handleDeviceMotion);
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
    };
} 