import React from 'react';

/**
 *  ModeTab: 상단 메인 탭 -[단독 모드] [VR 모드] [수면 리포트]
 *  @param {string} activeMode - 현재 선택된 모드 ID ('solo', 'vr', 'report')
 *  @param {function} onModeChange - 탭 클릭 시 부모 컴포넌트의 상태를 변경하는 핸들러
 */

function ModeTab({ activeMode, onModeChange }) {
    // 탭 구성을 배열로 관리하여 유지보수 용이성 확보 (아이템 추가 시 이 배열만 수정)
    const tabs = [
        { id: 'solo', label: '📱', text: '단독 모드' },
        { id: 'vr', label: '🥽', text: 'VR 모드' },
        { id: 'report', label: '📊', text: '수면 리포트' },
    ];

    return (
        // 전체 탭 컨테이너: 반투명 배경과 라운드 처리를 통해 모던한 느낌 부여
        <div style={{
            display: 'flex',
            backgroundColor: 'rgba( 255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '4px',
            marginBottom: '20px',
        }}>
            {tabs.map(tab => (
                // [이벤트] 클릭 시 부모로 받은 onModeChange를 호출.
                <div
                    key={tab.id}
                    onClick={() => onModeChange(tab.id)}
                    style={{
                        flex: 1,    // 탭들의 균등한 너비
                        textAlign: 'center',
                        padding: '10px 4px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        // 활성화(Active) 상태에 따른 조건부 스타일링 (배경색, 텍스트색, 굵기)
                        backgroundColor: activeMode === tab.id ? 'rgba( 107, 159, 255, 0.25)' : 'transparent',
                        color: activeMode === tab.id ? '#a8c8ff' : 'rgba( 255, 255, 255, 0.35)',
                        transition: '0.2s cubic-bezier( 0.4, 0, 0.2, 1)',     // 전환 시 약간의 탄성을 주는 베지어 곡선 추가 가능
                        fontWeight: activeMode === tab.id ? '600' : '400',
                    }}>
                    <div style={{ fontSize: '18px' }}>{tab.label}</div>
                    <div style={{ fontSize: '10px', marginTop: '2px', letterSpacing: '0.02em' }}>{tab.text}</div>
                </div>
            ))}
        </div>
    );
}

export default ModeTab;