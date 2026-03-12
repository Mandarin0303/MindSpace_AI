import React, { useEffect, useState, useRef } from 'react';
import { useSleepMode } from "./hooks/useSleepMode";
import { ref, set } from 'firebase/database';
import { db } from './firebase';


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

// 별 배경
function Stars() {
    const stars = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
        delay: Math.random() * 3,
    }));
    return (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
            {
                stars.map(s => (
                    <div key={s.id} style={{
                        position: 'absolute',
                        left: `${s.x}%`,
                        top: `${s.y}%`,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                        borderRadius: '50%',
                        backgroudColor: '#fff',
                        opacity: s.opacity,
                        animation: `twinkle 3s ${s.delay}s infinite alternate`,
                    }} />
                ))}
            <style>{`
    @keyframes twinkle {from {opacity: 0.1;} to {opacity: 0.8;}}
    @keyframes pulse {0%, 100%, {transform: scale(1); opacity:0.8;} 50% {transform: scale(1.05); opacity: 1;}}
    @keyframes fadeIn {from {opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);}}
    @keyframes breathe {0%, 100% {transform:scale(1);} 50% {transform: scale(1.08);}}
    @keyframes rotate { from {transform: rotate(0deg);} to {transform: rotate(360deg)}}
    `}</style>
        </div>
    );
}

// 달 모양 버튼
fuction MoonButton({ isSleepMode, sleepStatus, onClick }){
    const label = isSleepMode ? '수면 종료' : sleepStatus === 'idle' ? '수면 준비' : 'VR 대기 중...';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '24px 0' }}>
            <div onClick={onClick} style={{
                width: '140px', height: '140px', borderRadius: '50%', 
                background: isSleepMode 
                    ? 'radial-gradient(circle at 35% 35%, #f8e5a0, #e8b84b 50%, #c68f1a)'
                    : 'radial-gradient(circle at 35% 35%, #a8c8ff, #6b9fff 50%, #3a6fd8)',
                boxShadow: isSleepMode
                    ? '0 0 40px rgba(232, 184, 75, 0.5), 0 0 80px rgba(232, 184, 75, 0.2)'
                    : '0 0 40px rgba(107, 159, 255, 0.5), 0 0 80px rgba(107, 159, 255, 0.2)',
                cursor: 'pointer',
                animation: isSleepMode ? 'breath 4s ease-in-out infinite' : 'pulse 3s ease-in-out infinite',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: '0.5s',
            }}>
                <span style={{ fontSize: '48px' }}>{isSleepMode ? '🌕' : '🌙'}</span>
                {isSleepMode && (<div style={{
                    position: 'absolute', inset: '-8px', borderRadius: '50%',
                    border: '2px solid rgba(232, 184, 75, 0.3)',
                    animation: 'rotate 8s linear infinite',
                    borderTopColor: 'rgba(232, 184, 75, 0.8)',
                }} />
                )}
            </div>
            <p style={{
                marginTop: '12px', fontSize: '13px', opacity: 0.6, letterSpacing: '0.1em',
            }}>{label}</p>
        </div>
    );
}

// 토글 스위치
function Toggle({ label, icon, isOn onToggle, disabled }) {
    return (
        <div onClick={disabled ? null : onToggle} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'sapce-between',
            padding: '14px 16px', borderRadius: '14px',
            backgroundColor: isOn 
                ? 'rgba(107, 159, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${isOn ? 'rgba(107, 159, 255, 0.3)' : 'rgba(255,255,255,0.08)'}`,
            cursor: disabled ? 'not-allowed' : 'pointer', transition: '0.3s',
            opacity: disabled ? 0.4 : 1, marginBottom: '10px',
        }}>
            <div style={{ display: 'flax', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                <span style={{ fontSize: '14px', color: '#e8e8f0' }}>{label}</span>
            </div>
            <div style={{
                width: '46px', height: '26px', borderRadius: '13px',
                backgroundColor: isOn, ? '#6b9fff' : 'rgba(255, 255, 255, 0.15)',
                position: 'relative', transition: '0.3s', flexShrink:0,
    }}>
            <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                backgroundColor: '#fff', position: 'absholute', top: '3px',
                left: isOn ? '23px' : '3px',
                transition: '0.3s', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
            }} />
        </div>
    </div >
    );
}

// 수면 리포트 카드
function SleepReport({motionCount, elapsed, sleepStartTime, sleepStatus}){
    const quality = motionCount === 0 ? '매우 좋음' : motionCount <=2 ? '#74b9ff' : motionCount <= 5 ? '#ffeaa7' : '#ff7675';
    const qualityEmoji = motionCount === 0 ? '😴' : motionCount <= 2 ? '🙂' : motionCount <= 5 ? '😐' : '😟';
    const stausLabel = {
        sleeping: '수면 중', deeply_sleeping: '깊은 수면', motion_detected: '뒤척임 감지',
    };
    return (
        <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '20px', margoinBottom: '16px', animation: 'fadeIn 0.5s ease',
        }}>
            <p style={{
                fontSize: '11px', opacity: 0.4, letterSpacing: '0.15em', marginBottom: '16px', textTransform: 'uppercase' }}>
                수면 리포트
            </p>

            {/* 수치 3개 */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '26px', fontWeight: '700', color: '#e8e8f0', letterSpacing: '-0.02em' }}>{elapsed}</div>
                    <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '4px' }}>수면 시간</div>
                </div>
                <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.08)' }} />
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#e8e8f0' }}>
                        {sleepStartTime ? sleepStartTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit': '--:--'}
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '4px' }}>시작</div>
                </div>
            </div>

            {/* 수면 품질 */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '12px',
                padding: '12px 16px', marginBottom: '10px',
            }}>
                <span style={{ fontSize: '13px', opacity: 0.6 }}>수면 품질</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: qualityColor }}>
                    {qualityEmoji}{quality}
                </span>
            </div>
            {/* 현재 수면 단계 */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '12px 16px',
            }}>
                <span style={{ fontSize: '13px', opacity: 0.6 }}>현재 단계</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: sleepStatus === 'motion_detected' ? '#f39c12' : '#74b9ff' }}>
                    {statusLabel[sleepStatus] || '-'}
                </span>
            </div>
            );
}

            // 탭
            function Tab({tabs, activeTab, onTabChange}){
    return(
            <div style={{
                display: 'flex', backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: '12px', padding: '4px', marginBottom: '16px',
            }}>
                {tabs.map(tab => (
                    <div key={tab.id} onClick={() => onTabChange(tab.id)} style={{
                        flex: 1, textAlign: 'center', padding: '8px', borderRadius: '9px',
                        fontSize: '13px', cursor: 'pointer', backgroundColor activeTab === tab.id
                        ? rgba(107, 159, 255, 0.25)': 'transparent',
                color: activeTab === tab.id ? '#a8c8ff' : 'rgba(255,255,255,0.4)',
                transition:'0.2s', fontWeight: activeTab === tab.id ? '600' : '400',
            }}>
                {tab.label}
            </div>
))}
        </div>
    );
}


function App() {
    const {
        isSleepMode,
        sleepStatus,
        motionCount,
        prepareSleepMode,
        stopSleepMode,
    } = useSleepMode();

    // 앱 처음 로드 시 Firebase 상태 초기화
    useEffect(() => {
        set(ref(db, 'status/sleepMusicStart'), false);
        set(ref(db, 'status/bgmUrl'), '');
        console.log('[App] Firebase 초기화 완료');
    }, []);

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
        waiting: 'VR 기기 탈착 대기 중...',
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
            color: isSleepMode ? '#eee' : '#fff',
            minHeight: '100vh',
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
                onClick={isSleepMode ? stopSleepMode : prepareSleepMode}
                style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '20px'
                }}>
                {isSleepMode ? "수면 종료" : (sleepStatus === 'idle' ? "수면 준비 (한 번 눌러주세요)" : "VR 기기 탈착 대기 중...")}
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
                        height: '500px',
                        overflowY: 'auto',
                        textAlign: 'left',
                        lineHeight: '1.6',
                    }}>
                    {logs.length === 0 && (
                        <span style={{ opacity: 0.5 }}>로그 대기중...</span>
                    )}
                    {logs.map((log, i) => (
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
