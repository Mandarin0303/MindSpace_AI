import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useSleepMode } from "./hooks/useSleepMode";
import { ref, set } from 'firebase/database';
import { db } from './firebase';

import Stars from './components/Stars';
import Toggle from './components/Toggle';

// ------------------ 유틸 훅 ------------------

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
            setLogs(prev => [...prev.slice(-60), { type, msg, time }]); // 최대 60줄 유지
        };

        console.log = (...args) => { originalLog.current(...args); addLog('log', args); };
        console.warn = (...args) => { originalWarn.current(...args); addLog('warn', args); };

        return () => {
            console.log = originalLog.current;
            console.warn = originalWarn.current;
        };
    }, []);
    return logs;
}

// 클릭 소리 훅
function useClickSound(soundOn) {
    const audioCtxRef = useRef(null);
    const playSound = useCallback(() => {
        if (!soundOn) return;
        try {
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.07);
        } catch (_) { }
    }, [soundOn]);
    return playSound;
}

// 별 배경
<Stars />

//토글 

// 달 모양 버튼
function MoonButton({ isSleepMode, sleepStatus, onClick }) {
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
                {isSleepMode && (
                    <div style={{
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
function Toggle({ label, icon, isOn, onToggle, disabled }) {
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
                backgroundColor: isOn ? '#6b9fff' : 'rgba(255, 255, 255, 0.15)',
                position: 'relative', transition: '0.3s', flexShrink: 0,
            }}>
                <div style={{
                    width: '20px', height: '20px', borderRadius: '50%',
                    backgroundColor: '#fff', position: 'absholute', top: '50%',
                    transform: 'translateY(-50%)',
                    left: isOn ? '23px' : '3px',
                    transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                }} />
            </div>
        </div >
    );
}

// 수면 리포트 카드
function SleepReport({ motionCount, elapsed, sleepStartTime, sleepStatus }) {
    const quality = motionCount === 0 ? '매우 좋음' : motionCount <= 2 ? '좋음' : motionCount <= 5 ? '보통' : '나쁨';
    const qualityColor = motionCount === 0 ? "#55efc4" : motionCount <= 2 ? "#74b9ff" : motionCount <= 5 ? '#ffeaa7' : '#ff7675';
    const qualityEmoji = motionCount === 0 ? '😴' : motionCount <= 2 ? '🙂' : motionCount <= 5 ? '😐' : '😟';
    const statusLabel = {
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
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#e8e8f0' }}>{motionCount}회</div>
                    <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '4px' }}>뒤척임</div>
                </div>
                <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.08)' }} />
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#e8e8f0' }}>
                        {sleepStartTime ? sleepStartTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
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
        </div>
    );
}

// 탭
function Tab({ tabs, activeTab, onTabChange }) {
    return (
        <div style={{
            display: 'flex', backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '12px', padding: '4px', marginBottom: '16px',
        }}>
            {tabs.map(tab => (
                <div key={tab.id} onClick={() => onTabChange(tab.id)} style={{
                    flex: 1, textAlign: 'center', padding: '8px', borderRadius: '9px',
                    fontSize: '13px', cursor: 'pointer', 
                    backgroundColor: activeTab === tab.id
                        ? 'rgba(107, 159, 255, 0.25)' : 'transparent',
                    color: activeTab === tab.id ? '#a8c8ff' : 'rgba(255,255,255,0.4)',
                    transition: '0.2s', fontWeight: activeTab === tab.id ? '600' : '400',
                }}>
                    {tab.label}
                </div>
            ))}
        </div >
    );
}

function App() {
    const {
        isSleepMode,
        sleepStatus,
        motionCount,
        prepareSleepMode,
        stopSleepMode,
        setBgmVolume,
        setBinauralVolume,
        pauseBgm,
        resumeBgm,
    } = useSleepMode();

    const [bgmOn, setBgmOn] = useState(true);
    const [binauralOn, setBinauralOn] = useState(true);
    const [motionOn, setMotionOn] = useState(true);
    const [sleepStartTime, setSleepStartTime] = useState(null);
    const [elapsed, setElapsed] = useState('00:00');
    const [activeTab, setActiveTab] = useState('home');
    const [showLog, setShowLog] = useState(false);

    // 앱 처음 로드 시 Firebase 상태 초기화
    useEffect(() => {
        set(ref(db, 'status/sleepMusicStart'), false);
        set(ref(db, 'status/bgmUrl'), '');
        console.log('[App] Firebase 초기화 완료');
    }, []);

    useEffect(() => {
        if (isSleepMode) {
            setSleepStartTime(new Date());
            setBgmOn(true); setBinauralOn(true); setMotionOn(true);
            setActiveTab('home');
        } else {
            setSleepStartTime(null);
            setElapsed('00:00');
        }
    }, [isSleepMode]);

    useEffect(() => {
        if (!sleepStartTime) return;
        const timer = setInterval(() => {
            const diff = Math.floor((new Date() - sleepStartTime) / 1000);
            const m = String(Math.floor(diff / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            setElapsed(`${m}:${s}`);
        }, 1000);
        return () => clearInterval(timer);
    }, [sleepStartTime]);

    const toggleBgm = () => {
        if (bgmOn) { pauseBgm(); setBgmVolume(0); setBgmOn(false); console.log('[App] BGM OFF'); }
        else { resumeBgm(); setBgmVolume(0.4); setBgmOn(true); console.log('[App] BGM On'); }
    };

    const toggleBinaural = () => {
        if (binauralOn) { setBinauralVolume(0); setBinauralOn(false); console.log('[App] 바이노럴 OFF'); }
        else { setBinauralVolume(0.2); setBinauralOn(true); console.log('[App] 바이노럴 ON'); }
    };

    const toggleMotion = () => { 
        setMotionOn(prev => { console.log(`[App] 뒤척임 ${prev ? 'OFF' : 'ON'}`); return !prev; });
    };

    const logs = useScreenLog();
    const logBoxRef = useRef(null);

    useEffect(() => {
        if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }, [logs]);

    const statusText = {
        idle: '준비 완료', sleeping: '수면 중', deeply_sleeping: '깊은 수면 중',
        motion_detected: '뒤척임 감지!', waiting: 'VR 대기 중...',
    };
    const statusColor = {
        idle: '#a8c8ff', sleeping: '#55efc4', deeply_sleeping: '#74b9ff',
        motion_detected: '#f39c12', waiting: '#a29bfe',
    };

    return (
        <div style={{
            minHeight: '100vh', background: 'linear-gradient(180deg, #06071a 0%, #0d0f2b 40%, #12102a 100%)',
            color: '#e8e8f0', fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
            position: 'relative', overflowX: 'hidden',
        }}>
            <Stars />

            <div style={{ position: 'relative', zIndex: 1, padding: '0 20px 100px', maxWidth: '480px', margin: '0 auto' }}>

                {/* 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '56px 0 8px' }}>
                    <div>
                        <p style={{ fontSize: '12px', opacity: 0.4, letterSpacing: '0.15em', margin: 0 }}>MINDSPACE VR</p>
                        <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '2px 0 0', letterSpacing: '-0.02em' }}>
                            {isSleepMode ? '잘 자요 🌙' : '안녕하세요 👋'}
                        </h1>
                    </div>
                    <div style={{
                        width: '10px', height: '10px', borderRadius: '50%',
                        backgroundColor: isSleepMode ? '#55efc4' : sleepStatus === 'waiting' ? '#a29bfe' : '#6b9fff',
                        boxShadow: `0 0 10px ${isSleepMode ? '#55efc4' : '#6b9fff'}`,
                        animation: 'pulse 2s infinite',
                    }} />
                </div>

                {/* 탭 - 수면 모드일 때만 */}
                {isSleepMode && (
                    <Tab tabs={[
                        { id: 'home', label: '🌙 수면' },
                        { id: 'control', label: '🎛️ 컨트롤' },
                        { id: 'report', label: '📊 리포트' },
                    ]}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                    />
                )}

                {/* 홈 탭 */}
                {(!isSleepMode || activeTab === 'home') && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        {/* 상태 뱃지 */}
                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                            <span style={{
                                display: 'inline-block', padding: '6px 16px', borderRadius: '20px',
                                fontSize: '13px', backgroundColor: `${statusColor[sleepStatus] || '#6b9fff'}22`,
                                color: statusColor[sleepStatus] || '#6b9fff',
                                border: `1px solid ${statusColor[sleepStatus] || '#6b9fff'}44`,
                            }}>
                                {statusText[sleepStatus] || sleepStatus}
                            </span>
                        </div>

                        {/* 달 버튼 */}
                        <MoonButton
                            isSleepMode={isSleepMode}
                            sleepStatus={sleepStatus}
                            onClick={isSleepMode ? stopSleepMode : prepareSleepMode}
                        />

                        {/* 안내 텍스트 */}
                        {!isSleepMode && (
                            <div style={{
                                textAlign: 'center', backgroundColor: 'rgba(255, 255, 255, 0.04)',
                                borderRadius: '16px', padding: '16px 20px',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                            }}>
                                {sleepStatus === 'idle' ? (
                                    <>
                                        <p style={{ margin: '0 0 8px', fontSize: '14px', opacity: 0.8 }}>달을 눌러 수면을 준비하세요</p>
                                        <p style={{ margin: 0, fontSize: '12px', opcity: 0.4 }}>VR 기기 착용 후 명상을 시작하고<br />기기를 벗으면 자동으로 수면 모드가 시작됩니다</p>
                                    </>
                                ) : (
                                    <>
                                        <p style={{ margin: '0 0 8px', fontSize: '14px', opacity: 0.8 }}>✅ 준비 완료!</p>
                                        <p style={{ margin: 0, fontSize: '12px', opacity: 0.4 }}>VR 기기를 벗으면 수면 음악이 시작됩니다</p>
                                    </>
                                )}
                            </div>
                        )}

                        {/* 수면 중 간단 상태 */}
                        {isSleepMode && (
                            <div style={{
                                display: 'flex', justifyContent: 'space-around',
                                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                                borderRadius: '16px', padding: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '24px', fontWeight: '700' }}>{elapsed}</div>
                                    <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '4px' }}>수면 시간</div>
                                </div>
                                <div style={{ width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08' }} />
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '24px', fontWeight: '700' }}>{motionCount}회</div>
                                    <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '4px' }}>뒤척임</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
    
                {/* 컨트롤 탭 */}
                {isSleepMode && activeTab === 'control' && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <p style={{ fontSize: '12px', opacity: 0.4, letterSpacing: '0.1em', marginBottom: '14px' }}>오디오 컨트롤</p>
                        <Toggle label="수면 음악" icon="🎵" isOn={bgmOn} onToggle={toggleBgm} />
                        <Toggle label="바이노럴 주파수" icon="~" isOn={binauralOn} onToggle={toggleBinaural} />
                        <p style={{ fontSize: '12px', opacity: 0.4, letterSpacing: '0.1em', margin: '20px 0 14px' }}>센서</p>
                        <Toggle label="뒤척임 감지" icon="📳" isOn={motionOn} onToggle={toggleMotion} />

                        {/* 종료 버튼 */}
                        <div onClick={stopSleepMode} style={{
                            textAlign: 'center', padding: '14px', borderRadius: '14px',
                            border: '1px solid rgba(255, 118, 117, 0.3)',
                            backgroudColor: 'rgba(255, 118, 117, 0.08)',
                            color: '#ff7675', fontSize: '14px', fontWeight: '600',
                            cursor: 'pointer', marginTop: '24px',
                        }}>
                            🛑 수면 종료
                        </div>
                    </div>
                )
                }

                {/* 리포트 탭 */}
                {isSleepMode && activeTab === 'report' && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <SleepReport
                            motionCount={motionCount}
                            elapsed={elapsed}
                            sleepStartTime={sleepStartTime}
                            sleepStatus={sleepStatus}
                        />

                        {/* 뒤척임 타임라인 */}
                        <div style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.4)',
                            borderRadius: '20px',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            padding: '20px',
                        }}>
                            <p style={{ fontSize: '11px', opacity: 0.4, letterSpacing: '0.15em', marginBottom: '16px', textTransform: 'uppercase' }}>
                                수면 조언
                            </p>
                            {motionCount === 0 && <p style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.6 }}> 😴 뒤척임이 없어요! 매우 안정적인 수면 중이에요.</p>}
                            {motionCount > 0 && motionCount <= 2 && <p style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.6 }}> 😐 수면이 양호해요. 바이노럴 비트가 재입면을 도와드리고 있어요.</p>}
                            {motionCount > 2 && motionCount <= 5 && <p style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.6 }}> 😐 뒤척임이 좀 있어요. 실내 온도나 조명을 확인해보세요.</p>}
                            {motionCount > 5 && <p style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.6 }}> 😟 뒤척임이 많아요. 수면 환경을 개선해보세요.</p>}
                        </div>
                    </div >
                )}

                {/* 디버그 로그 토글 */}
                <div style={{ marginTop: '24px' }}>
                    <div
                        onClick={() => setShowLog(p => !p)}
                        style={{
                            display: 'flex', justifyCount: 'space-between', alignItems: 'center',
                            padding: '10px 14px', borderRadius: '10px',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            cursor: 'pointer', marginBottom: '8px',
                        }}>
                        <span style={{ fontSize: '12px', opacity: 0.4 }}>디버그 로그</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ fontSize: '12px', opacity: 0.3 }}>{showLog ? '▲ 접기' : '▼ 펼치기'}</span>
                            <span onClick={e => { e.stopPropagation(); window.location.reload(); }}
                                style={{ fontSize: '11px', opacity: 0.4, cursor: 'pointer' }}>새로고침</span>
                        </div>
                    </div>
                    {showLog && (
                        <div ref={logBoxRef} style={{
                            backgroud: 'rgba(0,0,0,0.7)', color: '#0f0',
                            fontFamily: 'monospace', fontSize: '10px',
                            padding: '10px', borderRadius: '10px',
                            height: '250px', overflowY: 'auto', lineHeight: '1.6',
                        }}>
                            {logs.length === 0 && <span style={{ opacity: 0.4 }}>로그 대기중...</span>}
                            {logs.map((log, i) => (
                                <div key={i} style={{ color: log.type === 'warn' ? '#f39c12' : '#0f0' }}>
                                    <span style={{ opacity: 0.5 }}>[{log.time}]</span>{log.msg}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}

export default App;

