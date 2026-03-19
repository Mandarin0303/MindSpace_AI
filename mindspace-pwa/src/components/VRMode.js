import React, { useState, useEffect } from 'react';
import MoonButton from './MoonButton';

import Toggle from './Toggle';
import SubTab from './SubTab';

import { useSleepMode } from '../hooks/useSleepMode';

/**
 * VR 기기(Quest 2) 수면 모드 화면
 * - Firebase 신호 수신으로 자동 수면 모드 전환
 * - 기기 탈착 감지 대기 -> 수면 음악 자동 시작
 * - 바이노럴/BGM/뒤척임/클릭소리 토글 컨트롤
 * @param playSound
 */

function VRMode({ playSound }) {
    // Custom Hook에서 필요한 상태 및 함수 가져오기
    const {
        isSleepMode,            // 현재 수면 모드 여부
        sleepStatus,            // 상세 상태 (idle, waiting, sleeping 등)
        motionCount,            // 뒤척임 횟수
        prepareSleepMode,       // 수면 준비 시작 함수
        stopSleepMode,          // 수면 종료 함수
        setBgmVolume,           // 배경음 볼륨 조절
        setBinauralVolume,      // 바이노럴 볼륨 조절
        pauseBgm,               // 배경음 일시정지
        resumeBgm,              // 배경음 재생
    } = useSleepMode();

    // 로컬 UI 상태 관리
    const [bgmOn, setBgmOn] = useState(true);
    const [binauralOn, setBinauralOn] = useState(true);
    const [motionOn, setMotionOn] = useState(true);
    const [soundOn, setSoundOn] = useState(true);
    const [sleepStartTime, setSleepStartTime] = useState(null);
    const [elapsed, setElapsed] = useState('00:00');
    const [activeTab, setActiveTab] = useState('home');

    // [이펙트] 수면 모드 시작 시 타이머 및 오디오 초기화
    useEffect(() => {
        if (isSleepMode) {
            setSleepStartTime(new Date());
            setBgmOn(true);
            setBinauralOn(true);
            setMotionOn(true);
            setActiveTab('home');
        } else {
            setSleepStartTime(null);
            setElapsed('00:00');
        }
    }, [isSleepMode]);

    // [이펙트] 수면 경과 시간 업데이트 (초 단위)
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

    // 오디오 및 센서 토글 핸들러 (버그 수정: 상태 반전 반영)
    const toggleBgm = () => {
        if (bgmOn) {
            pauseBgm();
            setBgmVolume(0);
        } else {
            resumeBgm();
            setBgmVolume(0.4);
        }
        setBgmOn(!bgmOn);
    };

    const toggleBinaural = () => {
        if (binauralOn) {
            setBinauralVolume(0);
        } else {
            setBgmVolume(0.2);      // 기존 bgmVolume 수정 버그 해결
        }
        setBinauralOn(!binauralOn);
    };

    const toggleMotion = () => setMotionOn(p => !p);
    const toggleSound = () => setSoundOn(p => !p);

    // 상태별 UI 설정값 (Badge 컬러 및 텍스트)
    const STATUS_UI = {
        idle: { text: '준비 완료', color: '#a8c8ff' },
        sleeping: { text: '수면 중', color: '#55efc4' },
        deeply_sleeping: { text: '깊은 수면 중', color: '#74b9ff' },
        motion_detected: { text: '뒤척임 감지!', color: '#f39c12' },
        waiting: { text: 'VR 기기 탈착 대기 중...', color: '#a29bfe' },
    };

    const currentStatus = STATUS_UI[sleepStatus] || { text: sleepStatus, color: '#6b9fff' };

    return (
        <div style={{ animation: 'fadeIn 0.4s ease' }}>
            {/* 상태 뱃지 */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <span 
                    style={{
                        display: 'inline-block',
                        padding: '5px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        backgroundColor: `${currentStatus.color}22`,
                        color: currentStatus.color,
                        border: `1px solid ${currentStatus.color}44`,
                    }}>
                    {currentStatus.text}
                </span>
            </div>

            {/* 수면 중 서브탭 */}
            {isSleepMode && (
                <SubTab 
                    tabs={[
                        { id: 'home', label: '🌙 수면' },
                        { id: 'control', label: '🎛️ 컨트롤' },
                    ]} 
                    activeTab={activeTab} 
                    onTabChange={setActiveTab}
                />
            )}

            {/* 메인 홈 섹션 (수면 전 혹은 수면 탭 활성화 시) */}
            {(!isSleepMode || activeTab === 'home') && (
                <>
                    <MoonButton 
                        isSleepMode={isSleepMode} 
                        sleepStatus={sleepStatus}
                        onClick={isSleepMode 
                            ? stopSleepMode
                            : prepareSleepMode}
                    />

                    {/* 수면 상태에 따른 안내/데이터 박스 전환 */}
                    {!isSleepMode ? (
                        <div style={infoBoxStyle}>
                            {sleepStatus === 'idle' ? (
                                <>
                                    <p style={{ margin: '0 0 6px', fontSize: '13px', opacity: 0.8 }}>
                                        달을 눌러 수면을 준비하세요
                                    </p>
                                    <p style={{ margin: 0, fontSize: '11px', opacity: 0.4 }}>
                                        VR 기기 착용 후 명상을 시작하고<br />
                                        기기를 벗으면 자동으로 수면 모드가 시작됩니다
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p style={{ margin: '0 0 6px', fontSize: '13px', opacity: 0.8 }}>
                                        ✅ 준비 완료!
                                    </p>
                                    <p style={{ margin: 0, fontSize: '11px', opacity: 0.4 }}>
                                        VR 기기를 벗으면 수면 음악이 시작됩니다
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (

                        /* 수면 중 대시보드 */
                        <div style={dataDashboardStyle}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700' }}>
                                    {elapsed}</div>
                                <div style={{ fontSize: '11px', opacity: 0.4, margintop: '4px' }}>
                                    수면 시간</div>
                            </div>
                            <div style={{ width: '1px', backgroundColor: 'rgba( 255, 255, 255, 0.08)' }} />
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700' }}>
                                    {motionCount}회</div>
                                <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '4px' }}>
                                    뒤척임</div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* 컨트롤 색션: 오디오 및 센서 설정 */}
            {isSleepMode && activeTab === 'control' && (
                <div style={{ padding: '0 4px' }}>
                    <p style={labelStyle}>오디오 컨트롤</p>
                    <Toggle 
                        label="수면 음악"
                        icon="🎵"
                        isOn={bgmOn}
                        onToggle={toggleBgm}
                        onSound={playSound}
                    />
                    <Toggle
                        label="바이노럴 주파수"
                        icon="〰️"
                        isOn={binauralOn}
                        onToggle={toggleBinaural}
                        onSound={playSound}
                    />
                    <p 
                        style={{
                            fontSize: '12px',
                            opacity: 0.4,
                            letterSpacing: '0.1em',
                            margin: '20px 0 14px'
                        }}
                    >센서 / 기타
                    </p>
                    <Toggle 
                        label="뒤척임 감지"
                        icon="📳"
                        isOn={motionOn}
                        onToggle={toggleMotion}
                        onSound={playSound}
                    />
                    <Toggle 
                        label="클릭 소리"
                        icon="🔔"
                        isOn={soundOn}
                        onToggle={toggleSound}
                        onSound={playSound}
                    />
                    <div 
                        onClick={stopSleepMode}
                        style={stopButtonStyle}>
                        🛑 수면 종료
                    </div>
                </div>
            )}
        </div >
    );
}

// 공통 스타일 정의
const infoBoxStyle = {
    textAlign: 'center',
    backgroundColor: 'rgba( 255, 255, 255, 0.04)',
    borderRadius: '16px',
    padding: '14px 20px',
    border: '1px solid rgba( 255, 255, 255, 0.06)',
};

const dataDashboardStyle = {
    display: 'flex',
    justifyContent: 'space-around',
    backgroundColor: 'rgba( 255, 255, 255, 0.04)',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid rgba( 255, 255, 255, 0.06)',
};

const labelStyle = {
    fontSize: '12px',
    opacity: 0.4,
    letterSpacing: '0.1em',
    marginBottom: '14px'
};

const stopButtonStyle = {
    textAlign: 'center',
    padding: '14px',
    borderRadius: '14px',
    marginTop: '24px',
    border: '1px solid rgba( 255, 118, 117, 0.3)',
    backgroundColor: 'rgba( 255, 118, 117, 0.08)',
    color: '#ff7675',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
};

export default VRMode;