import React, { useEffect, useState, useRef } from 'react';
import { ref, set } from 'firebase/database';
import { db } from './firebase';
import { getAuth, signInAnonymously } from 'firebase/auth';

import ModeTab from './components/ModeTab';
import SoloMode from './components/SoloMode';
import VRMode from './components/VRMode';
import ReportMode from './components/ReportMode';
import Stars from './components/Stars';

import useClickSound from './hooks/useClickSound';
import useScreenLog from './hooks/useScreenLog';

import './App.css';

/**
 * App - 루트 컴포넌트
 * @state activeMode - 현재 활성 모드 ('solo' | 'vr' | 'report')
 * @state soundOn - 클릭 효과음 on/off
 * @state showLog - 디버그 로그 패널 표시 여부
 */

function App() {
    const [activeMode, setActiveMode] = useState('solo');
    const [soundOn] = useState(true);
    const [showLog, setShowLog] = useState(false);
    const playSound = useClickSound(soundOn);
    const logs = useScreenLog();
    const logBoxRef = useRef(null);

    useEffect(() => {
        const auth = getAuth();
        signInAnonymously(auth).then(() => {
            console.log('[App] 익명 로그인 성공');
        });
    }, []);

    // 앱 처음 로드 시 Firebase 상태 초기화
    // -sleepMusicStart: 음악 재생 상태 리셋
    // -bgmUrl: BGM URL 초기화
    useEffect(() => {
        set(ref(db, 'status/sleepMusicStart'), false);
        set(ref(db, 'status/bgmUrl'), '');
        console.log('[App] Firebase 초기화 완료');
    }, []);

    // 새 로그 추가 시 스크롤 자동으로 맨 아래로 이동
    useEffect(() => {
        if (logBoxRef.current) {
            logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
        }
    }, [logs]);

    const headerTitle = {
        solo: '📱 단독 모드',
        vr: '🥽 VR 모드',
        report: '📊 수면 리포트',
    };
   
    return (
        <div style={{
            minHeight: '100vh', 
            background: 'linear-gradient(180deg, #06071a 0%, #0d0f2b 40%, #12102a 100%)',
            color: '#e8e8f0', 
            fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
            position: 'relative', 
            overflowX: 'hidden',
        }}>
            <Stars />

            <div style={{ position: 'relative', zIndex: 1, padding: '0 20px 100px', maxWidth: '480px', margin: '0 auto' }}>

                {/* 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '52px 0 16px' }}>
                    <div>
                        <p style={{ fontSize: '11px', opacity: 0.4, letterSpacing: '0.15em', margin: 0 }}>MINDSPACE VR</p>
                        <h1 style={{ fontSize: '20px', fontWeight: '700', margin: '2px 0 0', letterSpacing: '-0.02em' }}>
                            
                            {headerTitle[activeMode]}
                        </h1>
                    </div>
                    <div style={{
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%',
                        backgroundColor: '#6b9fff',
                        boxShadow: '0 0 10px #6b9fff',
                        animation: 'pulse 2s infinite',
                    }} />
                </div>

                {/* 모드 탭 */}
                <ModeTab activeMode={activeMode} onModeChange={setActiveMode} />

                {/* 활성 모드에 따라 SoloMode / VRMode / ReportMode 조건부 렌더링 */}
                {activeMode === 'solo' && <SoloMode playSound={playSound} />}
                {activeMode === 'vr' && <VRMode playSound={playSound} />}
                {activeMode === 'report' && <ReportMode />}

                {/* 디버그 로그 토글 */}
                <div style={{ marginTop: '24px' }}>
                    <div
                        onClick={() => setShowLog(p => !p)}
                        style={{
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '10px 14px', 
                            borderRadius: '10px',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            cursor: 'pointer', 
                            marginBottom: '8px',
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
                            backgroud: 'rgba(0,0,0,0.7)', 
                            color: '#0f0',
                            fontFamily: 'monospace', 
                            fontSize: '10px',
                            padding: '10px', 
                            borderRadius: '10px',
                            height: '250px', 
                            overflowY: 'auto', 
                            lineHeight: '1.6',
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

