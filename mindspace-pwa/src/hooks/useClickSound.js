import { useRef, useCallback } from 'react';

/**
 * [커스텀 훅] 클릭 시 짧고 깔끔한 전자 비프음(Beep) 효과음을 생성한다.
 * @param {boolean} soundOn - 소리 활성화 여부
 * @param {function} playSound - 호출 시 소리를 재생하는 함수
 */

function useClickSound(soundOn) {
    // 오디오 컨텍스트를 useRef로 관리하여 불필요한 재생성을 방지.
    const audioCtxRef = useRef(null);   

    const playSound = useCallback(() => {
        if (!soundOn) return;       // 소리 설정이 꺼져있으면 즉시 종료
        
        try {
            // [오디오 엔진 생성] 브라우저 호환성을 고려한 AudioContext 생성
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            const osc = ctx.createOscillator();     // 진동자(소리원)
            const gain = ctx.createGain();          // 볼륨 제어기

            // [연결] 소리원 -> 볼륨 조절 -> 출력(스피커)
            osc.connect(gain);
            gain.connect(ctx.destination);

            // [설정] 880Hz(높음 라 음)의 사인파를 사용
            osc.frequency.value = 880;
            osc.type = 'sine';

            // [엔벨로프(Envelope)] 소리가 짧고 부드럽게 감쇄되도록 볼륨 변화 설정
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

            // [재생] 0.07초 동안 짧게 재생 후 종료
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.07);
        } catch (_) {
            // Web Audio API 제한 등으로 인한 에러 무시
        }
    }, [soundOn]);
    return playSound;       // 외부에서 호출 가능한 함수 반환
}

export default useClickSound;