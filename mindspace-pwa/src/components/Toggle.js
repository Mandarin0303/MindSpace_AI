import React, { useState } from 'react';

/**
 * [공통 UI] 설정 값을 ON/OFF 하는 스위치 형태의 토글 버튼이다.
 * @param {string} label - 스위치 옆에 표시될 이름
 * @param {string} icon - 표시할 이모지 또는 아이콘
 * @param {boolean} isOn - 현재 활성화 여부
 * @param {function} onToggle - 클릭 시 부모의 상태를 변경할 함수
 * @param {boolean} disabled - 비활성화 여부
 * @param {function} onSound - 클릭 시 재생할 효과음 함수
 */

function Toggle({ label, icon, isOn, onToggle, disabled, onSound }) {
    // 버튼을 눌렀을 때 살짝 줄어드는 애니메이션 효과를 위한 상태값
    const [pressed, setPressed] = useState(false);

    const handleClick = () => {
        if (disabled) return;       // 비활성화 상태라면 아무 일도 안 함

        // 클릭 효과: 잠시 버튼을 줄어들게(pressed) 설정
        setPressed(true);
        if (onSound) onSound();     // 효과음 재생

        // 0.15초 후에 눌림 상태 해제 및 실제 토글 함수 실행
        setTimeout(() => {
            setPressed(false);
            if (onToggle) onToggle();
        }, 150);       
    };
    return (
        // 전체 스위치 박스 (스타일 정의)
        <div 
            onClick={handleClick} 
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '14px',
                marginBottom: '10px',
                cursor: disabled ? 'not-allowed' : 'pointer', 
                opacity: disabled ? 0.4 : 1,        // 비활성화 시 흐리게

                // [배경 및 테두리] ON/OFF 상태에 따라 색상 변경
                backgroundColor: isOn 
                    ? 'rgba( 107, 159, 255, 0.15)' 
                    : 'rgba( 255, 255, 255, 0.05)',
                border: `1px solid ${isOn 
                    ? 'rgba( 107, 159, 255, 0.3)' 
                    : 'rgba( 255, 255, 255, 0.08)'}`,
            
                // [애니메이션] 클릭 시 scale 효과 적용
                transform: pressed ? 'scale(0.96)' : 'scale(1)', 
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
        >
            {/* 왼쪽: 아이콘과 라벨 텍스트 영역 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                <span style={{ fontSize: '14px', color: '#e8e8f0', fontWeight: '500' }}>{label}</span>
            </div>

            {/* 오른쪽: 실제 스위치 작동 UI (트랙과 원) */}
            <div style={{
                width: '44px', 
                height: '24px', 
                borderRadius: '12px',
                position: 'relative',
                flexShrink: 0,
                backgroundColor: isOn 
                    ? '#6b9fff' 
                    : 'rgba( 255, 255, 255, 0.15)',   // 상태에 따라 색상 전환
                transition: 'background-color 0.3s ease',    // 색상 변화를 부드럽게
            }}>
                {/* 스위치 내부의 움직이는 작은 원 */}
                <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    position: 'absolute',
                    top: '3px',     // 상하 여백 정렬
                    left: isOn ? '23px' : '3px',        // 상태에 따라 좌우 위치 조정
                    transition: 'left 0.25s cubic-bezier( 0.4, 0, 0.2, 1)',     // 움직임을 부드럽게
                    boxShadow: '0 2px 4px rgba( 0, 0, 0, 0.2)',
                }} />
            </div>
        </div>
    );
}

export default Toggle;
