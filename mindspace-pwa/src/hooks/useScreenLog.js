import { useRef, useState, useEffect } from "react";

/**
 * [커스텀 훅] 브라우저 콘솔 메시지를 가로채서 React 상태로 관리한다.(화면 디버깅용)
 */

function useScreenLog() {

    // 화면에 출력할 로그 리스트 상태 (최대 60개 유지)
    const [logs, setLogs] = useState([]);
    
    // 기존 브라우저 콘솔 함수를 안전하게 보관할 Ref
    const originalLog = useRef(console.log);           
    const originalWarn = useRef(console.warn);
    const originalError = useRef(console.error);

    useEffect(() => {
        // 클린업 함수에서 안전하게 참조하기 위한 변수에 복사
        const logFunc = originalLog.current;
        const warnFunc = originalWarn.current;
        const errorFunc = originalError.current;

        // [로그 처리 함수] 콘솔 메시지를 받아 포맷팅 후 상태에 추가
        const addLog = (type, args) => {
            // 인자들을 실제 콘솔처럼 공백('')으로 구분하여 합침(객체는 JSON 문자열화)
            const msg = args
                .map(arg => (typeof arg === 'object' 
                    ? JSON.stringify(arg) : String(arg)))
                .join('');

            const time = new Date().toLocaleTimeString('ko-KR', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });

            // 상태 업데이트: 이전 로그 60개 유지 + 새 로그 추가(고유 ID 포함)
            setLogs(prev => [
                ...prev.slice(-59),
                { id: Date.now() + Math.random(), type, msg, time }
            ]);
        };

        // [Hooking] console 메서드를 재정의 (기존 기능 유지 + 화면 업데이트 추가)
        console.log = (...args) => { 
            logFunc.apply(console, args);   // 원래 콘솔에 출력
            addLog('log', args);                        // 화면 상태에 추가
        };
        console.warn = (...args) => { 
            warnFunc.apply(console, args);
            addLog('warn', args); 
        };
        console.error = (...args) => {
            errorFunc.apply(console.args);
            addLog('error', args);
        }

        // [Cleanup] 컴포넌트가 사라질 때 브라우저 순정 콘솔로 복구 (매우 중요!)
        return () => { 
        console.log = logFunc;
        console.warn = warnFunc;
        console.error = errorFunc;
        };
    }, []);         // 컴포넌트 마운트 시 1회 실행
   
    return logs;    // 캡처된 로그 배열 반환
}

export default useScreenLog;