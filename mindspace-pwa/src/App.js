import React, { useEffect, useState, useRef } from 'react';
import { useSleepMode } from "./hooks/useSleepMode";
//import { db } from './firebase';

// 화면 로그 - 콘솔 로그를 화면에도 출력
function useScreenLog() {
    const [logs, setLogs] = useState([]);
    const originalLog = useRef(null);
    const originalWarn = useRef(null);

    useEffect(() => {
        originalLog.current = console.log;
        originalWarn.current = console.warn;

        const addLog = (type, args) => {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join('');
            const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
            setLogs(prev => [...prev.slice(-30), { type, msg, time }]); // 최대 30줄 유지
        };

        console.log = (...args) => {
            originalLog.current(...args);
            addLog('log', args);
        };
        console.warn = (...args) => {
            originalWarn.current(...args);
            addLog('warn', args);
        };

        return () => {
            console.log = originalLog.current;
            console.warn = originalWarn.current;
        };
    }, []);
    return logs;
}

function App() {
    const {
        isSleepMode,
        sleepStatus,
        motionCount,
        startSleepMode,
        stopSleepMode,
    } = useSleepMode();

    const logs = useScreenLog();
    const logBoxRef = useRef(null);

    // 새 로그 올 때마다 자동 스크롤
    useEffect(() => {
        if (logBoxRef.current) {
            logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
        }
    }, [logs]);

    // 상태별 텍스트
    const statusText = {
        idle: '대기 중',
        sleeping: '수면 중(볼륨 보통)',
        deeply_sleeping: '깊은 수면 중 (볼륨 작게)',
        motion_detected: '뒤척임 감지! (볼륨 크게)',
    }
    const statusColor = {
        idle: '#fff',
        sleeping: '#fff',
        deeply_sleeping: '#74b9ff',
        motion_detected: '#f39c12',
    }

    return (
        <div style={{
            textAlign: 'center',
            backgroundColor: isSleepMode ? '#1a1a2e' : '#2c3e50',
            color: isSleepMode ? '#000' : '#fff',
            minheight: '100vh',
            transition: '0.5s',
            padding: '20px',
            boxSizing: 'border-box'
        }}>
            <h1 style={{ fontSize: '20px' }}>MindSpace VR 연동</h1>
            <div style={{
                padding: '20px',
                border: '2px solid',
                display: 'inline-block',
                borderRadius: '15px',
                marginBottom: '16px'
            }}>
                <h2 style={{ margin: '0 0 8px' }}>{isSleepMode ? "수면 모드 중" : "VR 명상 중"}</h2>
                <p style={{ margin: '4px 0', color: statusColor[sleepStatus] || '#fff' }}>상태: {statusText[sleepStatus] || sleepStatus}</p>
                {isSleepMode && <p style={{ margin: '4px 0' }}> 뒤척임 횟수: {motionCount}회 </p>}
                {isSleepMode && sleepStatus === 'motion_detected' && (
                    <p style={{ color: `#f39c12`, margin: '4px 0' }}> 재입면 유도 중.. </p>
                )}
            </div>
            <br /><br />
            {/* 이 버튼이 Web Audio API 초기화 역할도 함 */}
            <button
                onClick={isSleepMode ? stopSleepMode : startSleepMode}
                style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBotton: '20px'
                }}>
                {isSleepMode ? "수면 종료" : "수면 준비 (한 번 눌러주세요)"}
            </button>

            {/* 화면 로그 창 */}
            <div style={{ textAlign: 'left', marginTop: '10px' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItem: 'center',
                    marginBottom: '4px'
                }} >
                    <span style={{ fontSize: '12px', opacity: 0.7 }}> 디버그 로그 </span>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'transparent',
                            border: '1px solid',
                            color: 'inherit'
                        }}>
                        새로고침
                    </button>
                </div>
                <div ref={logBoxRef}
                    style={{
                        background: 'rgba(0,0,0,0.6)',
                        color: '#0f0',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        padding: '10px',
                        borderRadius: '8px',
                        height: '200px',
                        overflowY: 'auto',
                        textAlign: 'left',
                        lineHeight: '1.6',
                    }}>
                    {logs.lenth === 0 && (
                        <span style={{ opacity: 0.5 }}>로그 대기중...</span>
                    )}
                    {logs.map((log, i) =>(
                    <div key={i} style={{ color: log.type === 'warn' ? '#f39c12' : '#0f0' }}>
                        < span style={{ opacity: 0.6 }}>[{log.time}]</span>{log.msg}
                    </div>
                ))}
                </div>
            </div>
        </div>
    );
}

export default App;
