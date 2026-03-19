import React, { useState, useEffect, useRef } from 'react';
import Toggle from './Toggle';
import MoonButton from './MoonButton';
import SubTab from './SubTab';

import { useSleepMode } from '../hooks/useSleepMode';
import useScreenLog from '../hooks/useScreenLog';

import { ref, set } from "firebase/database";
import { db } from "../firebase";

/**
 * 모바일 단독 모드를 사용하는 전체 화면
 * - 기본음악 or 유저 커스텀 mp3 선택
 * - 수면 시작/종료, 수면 시간 타이머, 뒤척임 카운터
 * - 바이노럴/BGM/뒤척임 토글 컨트롤
 * @param playSound 
 */

function SoloMode({ playSound }) {
    // [커스텀 훅] useSleepMode 커스텀 훅을 통해 전역 수면 상태 관련 상태값과 함수들 가져옴.
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

    // [로컬 상태] 음악 설정, 타이머, UI 탭 전환을 위한 상태들
    const [bgmOn, setBgmOn] = useState(true);
    const [binauralOn, setBinauralOn] = useState(true);
    const [motionOn, setMotionOn] = useState(true);
    const [customBgmUrl, setCustomBgmUrl] = useState(null);
    const [customBgmName, setCustomBgmName] = useState(null);
    const [selectedMusic, setSelectedMusic] = useState('default');
    const [sleepStartTime, setSleepStartTime] = useState(null);
    const [elapsed, setElapsed] = useState('00:00');
    const [activeTab, setActiveTab] = useState('home');
    const fileInputRef = useRef(null);

    // [Effect] 음악 선택이 변경될 때 마다 Firebase의 실시간 DB에 URL을 업데이트함.(서버 연동용)
    useEffect(() => {
        const url = selectedMusic === 'custom' && customBgmUrl 
        ? customBgmUrl 
        : '/sounds/sleep_music.mp3';

        // db 객체가 존재할 때만 실행 (에러 방지)
        if (typeof db !== 'undefined') {
            set(ref(db, 'status/bgmUrl'), url);
        }
    }, [selectedMusic, customBgmUrl]);

    // [Effect] 수면 모드 진입/해제 시 상태를 초기화하거나 시작 시간을 기록함.
    useEffect(() => {
        if (isSleepMode) {
            setSleepStartTime(new Date());
            setBgmOn(true);
            setBinauralOn(true);
            setMotionOn(true);
            setActiveTab('home');       // 수면 시작 시 자동으로 홈 탭 표시
        } else {
            setSleepStartTime(null);
            setElapsed('00:00');
        }
    }, [isSleepMode]);

    // [Effect] 실시간 수면 타이머: 수면 시작 후 1초마다 경과 시간 계산
    useEffect(() => {
        if (!sleepStartTime) return;
        const timer = setInterval(() => { 
            const diff = Math.floor((new Date() - sleepStartTime) / 1000);
            const m = String(Math.floor(diff / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            setElapsed(`${m}:${s}`);
        }, 1000);
        return () => clearInterval(timer);      // 메모리 누수 방지를 위한 클린업
    }, [sleepStartTime]);

    // [메모리 관리] 컴포넌트가 사라지거나 음악이 바뀔 때 임시 URL 메모리 해제
    useEffect(() => {
        return () => {
            if (customBgmUrl) URL.revokeObjectURL(customBgmUrl);
        };
    }, [customBgmUrl]);

    // 유저 mp3 파일 업로드 처리
    // URL.createObjectURL()로 로컬 파일을 임시 URL로 변환 -> 서버 업로드 없이 재생 가능
    // [핸들러] 로컬 오디오 파일 로드 (서버 업로드 없이 브라우저 메모리 활용)
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (customBgmUrl) URL.revokeObjectURL(customBgmUrl);    // 기존 URL 해제
        const url = URL.createObjectURL(file);
        setCustomBgmUrl(url);
        setCustomBgmName(file.name);
        setSelectedMusic('custom');
        console.log('[Solo] 커스텀 음악 로드', file.name);
    };

    // [제어 함수] 음악/주파수 재생 상태에 따라 볼륨과 상태를 토글함.
    const toggleBgm = () => {
        if (bgmOn) { pauseBgm(); setBgmVolume(0); setBgmOn(false); }
        else { resumeBgm(); setBgmVolume(0.4); setBgmOn(true); }
    };
    const toggleBinaural = () => {
        if (binauralOn) { setBinauralVolume(0); setBinauralOn(false); }
        else { setBinauralVolume(0.2); setBinauralOn(true); }
    };
    const toggleMotion = () => setMotionOn(p => !p);

    // [데이터] UI 표시를 위한 상태별 텍스트와 색상 정의
    const statusText = {
        idle: '준비 완료',
        sleeping: '수면 중',
        deeply_sleeping: '깊은 수면 중',
        motion_detected: '뒤척임 감지!',
        waitting: '대기 중...',
    };
    const statusColor = {
        idle: '#a8c8ff',
        sleeping: '#55efc4',
        deeply_sleeping: '#74b9ff',
        motion_detected: '#f39c12',
        waiting: '#a29bfe',
    };

    return (
        <div style={{
            animation: 'fadeIn 0.4s ease'
        }}>
            {/* 상태 뱃지: 현재 수면 상태를 표시 */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <span style={{
                    display: 'inline-block',
                    padding: '5px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    // 동적 상태 컬러 적용 (알 수 없는 상태일 경우 기본 파란색)
                    backgroundColor: `${statusColor[sleepStatus] || '#6b9fff'}22`,
                    color: statusColor[sleepStatus] || '#6b9fff',
                    border: `1px solid ${statusColor[sleepStatus] || '#6b9fff'}44`,
                }}>
                    {statusText[sleepStatus] || sleepStatus}
                </span>
            </div>

            {/* 수면 중 서브탭: 수면 중일 때만 표시되는 컨트롤 탭 메뉴 */}
            {isSleepMode && (
                <SubTab tabs={[
                    { id: 'home', label: '🌙 수면' },
                    { id: 'control', label: '🎛️ 컨트롤' },
                ]} activeTab={activeTab} onTabChange={setActiveTab} />
            )}

            {/* 홈 탭: 수면 시작 버튼과 음악 선택 옵션을 제공 */}
            {(!isSleepMode || activeTab === 'home') && (
                <>
                    <MoonButton isSleepMode={isSleepMode} sleepStatus={sleepStatus}
                        onClick={isSleepMode ? stopSleepMode : prepareSleepMode} />

                    {/* 음악 선택 카드 - 수면 시작 전에만 표시 */}
                    {!isSleepMode && (
                        <div style={{
                            backgroundColor: 'rgba( 255, 255, 255, 0.04)',
                            borderRadius: '16px',
                            padding: '16px',
                            border: '1px solid rgba( 255, 255, 255, 0.06)',
                            marginBottom: '12px',
                        }}>
                            <p style={{
                                fontSize: '11px',
                                opacity: 0.4,
                                letterSpacing: '0.1em',
                                margin: '0 0 12px',
                                textTransform: 'uppercase'
                            }}>수면 음악 선택</p>

                            {/* 기본 음악 선택 */}
                            <div onClick={() => setSelectedMusic('default')} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                marginBottom: '8px',
                                backgroundColor: selectedMusic === 'default' ? 'rgba( 107, 159, 255, 0.2)' : 'rgba( 255, 255, 255, 0.04)',
                                border: `1px solid ${selectedMusic === 'default' ? 'rgba( 107, 159, 255, 0.4)' : 'rgba( 255, 255, 255, 0.06)'}`,
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                }}>
                                    <span style={{ fontSize: '18px' }}>🎵</span>
                                    <div>
                                        <div style={{ fonsSize: '13px', color: '#e8e8f0' }}>기본 수면 음악</div>
                                        <div style={{ fontSize: '11px', opacity: 0.4 }}>sleep_music.mp3</div>
                                    </div>
                                </div>
                                {selectedMusic === 'default' && <span style={{ color: '#6b9ff', fontSize: '16px' }}></span>}
                            </div>

                            {/* 커스텀 mp3 업로드(숨겨진 input 클릭) */}
                            <div onClick={() => fileInputRef.current?.click()} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                backgroundColor: selectedMusic === 'custom' ? 'rgba( 107, 159, 255, 0.2)' : 'rgba( 255, 255, 255, 0.04)',
                                border: `1px dashed ${selectedMusic === 'custom' ? 'rgba( 107, 159, 255, 0.4)' : 'rgba( 255, 255, 255, 0.15)'}`,
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                }}>
                                    <span style={{ fontSize: '18px' }}>📂</span>
                                    <div>
                                        <div style={{ fontSize: '13px', color: '#e8e8f0' }}>
                                            {customBgmName ? customBgmName : '내 음악 불러오기'}
                                        </div>
                                        <div style={{ fontSize: '11px', opacity: 0.4 }}>
                                            {customBgmName ? '탭하여 변경' : 'mp3, wav, aac 등 지원'}
                                        </div>
                                    </div>
                                </div>
                                {selectedMusic === 'custom' && <span style={{ color: '#6b9fff', fontSize: '16px' }}></span>}
                            </div>
                            {/* hidden file input - 위 div 클릭 시 트리거 */}
                            <input ref={fileInputRef} type="file" accept="audio/*"
                                onChange={handleFileUpload} style={{ display: 'none' }} />
                        </div>
                    )}

                    {/* 수면 전 안내 메세지 */}
                    {!isSleepMode && (
                        <div style={{
                            textAlign: 'center',
                            backgroundColor: 'rgba( 255, 255, 255, 0.04)',
                            borderRadius: '16px',
                            padding: '14px 20px',
                            border: '1px solid rgba( 255, 255, 255, 0.06)',
                        }}>
                            <p style={{ margin: '0 0 6px', fontSize: '13px', opacity: 0.8 }}>
                                달을 눌러 수면을 시작하세요</p>
                            <p style={{ margin: 0, fontSize: '11px', opacity: 0.4 }}>
                                VR 기기 없이 바로 수면 모드를 사용할 수 있어요</p>
                        </div>
                    )}

                    {/* 수면 중 데이터 - 수면 시간 / 뒤척임 횟수 */}
                    {isSleepMode && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            backgroundColor: 'rgba( 255, 255, 255, 0.04)',
                            borderRadius: '16px',
                            padding: '16px',
                            border: '1px solid rgba( 255, 255, 255, 0.06)',
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700' }}>{elapsed}</div>
                                <div style={{
                                    fontSize: '11px', opacity: 0.4, marginTop: '4px'
                                }}>수면 시간</div>
                            </div>
                            <div style={{ width: '1px', backgroundColor: 'rgba( 255, 255, 255, 0.08)' }} />
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700' }}>{motionCount}회</div>
                                <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '4px' }}>뒤척임</div>
                            </div>
                        </div>
                    )}
                </>
            )}
            {/* 컨트롤 탭: 수면 중 오디오 센서 설정 */}
            {isSleepMode && activeTab === 'control' && (
                <div>
                    <p style={{
                        fontSize: '12px',
                        opacity: 0.4,
                        letterSpacing: '0.1em',
                        marginBottom: '14px',
                    }}>오디오 컨트롤</p>
                    <Toggle label="수면 음악" icon="🎵" isOn={bgmOn} onToggle={toggleBgm} onSound={playSound} />
                    <Toggle label="바이노럴 주파수" icon="〰️" isOn={binauralOn} onToggle={toggleBinaural} onSound={playSound} />
                    <p style={{
                        fontSize: '12px', opacity: 0.4, letterSpacing: '0.1em', margin: '20px 0 14px'
                    }}>센서</p>
                    <Toggle label="뒤척임 감지" icon="📳" isOn={motionOn} onToggle={toggleMotion} onSound={playSound} />

                    {/* 수면 종료 버튼 */}
                    <div onClick={stopSleepMode} style={{
                        textAlign: 'center',
                        padding: '14px',
                        borderRadius: '14px',
                        marginTop: '24px',
                        border: '1px solid rgba( 255, 118, 117, 0.3',
                        backgroundColor: 'rgba( 255, 118, 117, 0.08)',
                        color: '#ff7675',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                    }}>🛑 수면 종료</div>
                </div>
            )}
        </div>
    );
} export default SoloMode;