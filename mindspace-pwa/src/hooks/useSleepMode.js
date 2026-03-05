import { db } from '../firebase';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getDatabase, ref, onValue, set } from 'firebase/database';
import { initializeApp } from 'firebase/app';

// ----- 뒤척임 감지 파라미터 -----
const MOTION_THRESHOLD = 1.8;
const MOTION_COOLDOWN_MS = 15000;
const SLEEP_MUSIC_URL = '/sounds/sleep_music.mp3';
const REINDUCTION_SOUND_URL = '/sounds/reinduction_binaural.mp3';

// ------------------------------
export function useSleepMode() {
    // ----- 외부에 노출할 상태 -----
    const [isSleepMode, setIsSleepMode] = useState(false);
    const [motionCount, setMotionCount] = useState(0);   // 뒤척임 감지 횟수
    const [sleepStatus, setSleepStatus] = useState('idle');
    // idle | sleeping | motion_detected

    // ----- 내부 ref (리렌더링 없이 유지해야 하는 값) -----
    const audioCtxRef = useRef(null);
    const sleepMusicNodeRef = useRef(null);
    const reinductionNodeRef = useRef(null);
    const prevAccelRef = useRef({ x: 0, y: 0, z: 0 });
    const motionCooldownRef = useRef(false);
    const sleepStartTimeRef = useRef(null);
    const isSleepModeRef = useRef(false);   // devicemotion 핸들러에서 최신 상태 창조용

    const firebaseConfig = { databaseURL: "https://mindspace-vr-default-rtdb.firebaseio.com/" };
    const app = initializeApp(firebaseConfig);  // 이미 App.js에서 초기화했으면 중복되니까
    const db = getDatabase();                   // 아래 방법으로 해결 -> firebase 설정을 별도 파일로 분리.

    // ----- 오디오 파일 로드 헬퍼 -----
    const loadAudio = useCallback(async (url) => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtxRef.current.decodeAudioData(arrayBuffer);
    }, []);

    // ----- 수면 유도 음악 재생 -----
    const playSleepMusic = useCallback(async () => {
        if (!audioCtxRef.current) return;
        try {
            const buffer = await loadAudio(SLEEP_MUSIC_URL);

            sleepMusicNodeRef.current = audioCtxRef.current.createBufferSource();
            sleepMusicNodeRef.current.buffer = buffer;
            sleepMusicNodeRef.current.loop = true;

            const gain = audioCtxRef.current.createGain();
            gain.gain.value = 0.6;  // 잔잔하게 60%

            sleepMusicNodeRef.current.connect(gain);
            gain.connect(audioCtxRef.current.destination);
            sleepMusicNodeRef.current.start();

            console.log('[useSleepMode] 수면 유도 음악 재생 시작');
        } catch (e) {
            console.warn('[useSleepMode] 수면 음악 로드 실패:', e);
        }
    }, [loadAudio]);

    // ----- 재입면 사운드 재생 (뒤척임 감지 시) ------
    const playReinductionSound = useCallback(async () => {
        if (!audioCtxRef.current) return;
        try {
            // 이전 재입면 사운드 중단
            if (reinductionNodeRef.current) {
                try { reinductionNodeRef.current.stop(); } catch (_) { }
            }

            const buffer = await loadAudio(REINDUCTION_SOUND_URL);

            reinductionNodeRef.current = audioCtxRef.current.createBufferSource();
            reinductionNodeRef.current.buffer = buffer;
            reinductionNodeRef.current.loop = false;    //한 번만 재생

            const gain = audioCtxRef.current.createGain();
            gain.gain.value = 0.8;

            reinductionNodeRef.current.connect(gain);
            gain.connect(audioCtxRef.current.destination);
            reinductionNodeRef.current.start();

            console.log('[useSleepMode] 재입면 사운드 재생');
        } catch (e) {
            console.warn('[useSleepMode] 재입면 사운드 로드 실패:', e);
        }
    }, [loadAudio]);

    // ----- 모든 오디오 정지 ------
    const stopAllAudio = useCallback(() => {
        if (sleepMusicNodeRef.current) {
            try { sleepMusicNodeRef.current.stop(); } catch (_) { }
            sleepMusicNodeRef.current = null;
        }
        if (reinductionNodeRef.current) {
            try { reinductionNodeRef.current.stop(); } catch (_) { }
            reinductionNodeRef.current = null;
        }
    }, []);

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
            console.log('[useSleepMode] 뒤척임 감지! delta=${delta.toFixed(2)}');

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
    }, [db, playReinductionSound]);

    // ----- 뒤척임 감지 시작 (ios 권한 포함) -----
    const startMotionDetection = useCallback(() => {
        if (typeof DeviceMotionEvent === 'undefined') {
            console.warn('[useSleepMode] DeviceMotionEvent 미지원 기기');
            return;
        }

        if (typeof DeviceMotionEvent.requestPermistion === 'function') {
            // ios 13+ 권한 요청
            DeviceMotionEvent.requiestPermission()
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

        // Web Audio Context 초기화 (반드시 사용자 제스처 내에서)
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        isSleepModeRef.current = true;
        setIsSleepMode(true);
        startMotionDetection();
        requestWakeLock();

        set(ref(db, 'status/sleepStartTime'), sleepStartTimeRef.current);
        console.log('[useSleepMode] 수면 모드 시작');
    }, [db, playSleepMusic, startMotionDetection, requestWakeLock]);

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
            console.log('[useSleepMode] 수면 종료 - 총 ${durationMin}분');
        }
        set(ref(db, 'status/sleepMusicStart'), false);
    }, [db, stopAllAudio, handleDeviceMotion]);

    // ----- Firebase 신호 감시 ( 자동 수면 모드 진입) -----
    useEffect(() => {
        const sleepRef = ref(db, 'status/sleepMusicStart');
        const unsubscribe = onValue(sleepRef, (snapshot) => {
            const shouldStart = snapshot.val();

            if (shouldStart === true && !isSleepModeRef.current) {
                console.log('[useSleepMode] Firebase 수면 수신');
                // Firebase 신호는 사용자 제스처가 아니므로 
                // AudioContext가 이미 생성된 경우에만 자동 시작 가능
                // 최초 진입은 반드시 버튼(startSleepMode)으로 AudioContext 생성 후 동작
                if (audioCtxRef.current) {
                    startSleepMode();
                } else {
                    console.warn('[useSleepMode] AudioContext 미생성 - 버튼으로 먼저 수면 모드 시작 필요');
                } 
            } else if (shouldStart === false && isSleepModeRef.current) {
                stopSleepMode();
            }
        });

        // 컴포넌트 언마운트 시 Firebase 리스너 해제
        return () => unsubscribe();
    }, [db, startSleepMode, stopSleepMode]);

    // ----- 컴포넌트 언마운트 시 정리 -----
    useEffect(() => {
        return () => {
            stopAllAudio();
            window.removeEventListtener('devicemotion', handleDeviceMotion);
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
    };
} 