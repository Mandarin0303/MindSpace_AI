import React, { useState } from 'react';

// Toggle 컴포넌트: 설정 값을 켜고 끄는 스위치 형태의 버튼
// label: 스위치 이름, isOn: 켜짐 상태, onToggle:클릭 시 실행할 함수, 
// disabled: 사용 여부, onSound: 클릭음 함수

function Toggle({ label, icon, isOn, onToggle, disabled, onSound }) {
    // 버튼을 눌렀을 때 살짝 줄어드는 애니메이션 효과를 위한 상태값
    const [pressed, setPressed] = useState(false);

    const handleClick = () => {
        if (disabled) return;       // 비활성화 상태라면 아무 일도 안 함

        // 1. 클릭 효과: 잠시 버튼을 줄어들게(pressed) 설정
        setPressed(true);
        setTimeout(() => setPressed(false), 150);       // 0.15초 뒤에 다시 원래 크기로

        // 2. 사운드 재생 (전달받은 함수가 있다면 실행)
        if (onSound) onSound();

        // 3. 부모 컴포넌트로부터 받은 스위치 상태 변경 함수 실행
        onToggle();
    };
    return (
        // 전체 스위치 박스 (스타일 정의)
        <div onClick={handleClick} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: '14px',
            // 켜져 있을 때와 꺼져 있을 때 배경색과 테두리 색상 변화
            backgroundColor: isOn ? 'rgba( 107, 159, 255, 0.15)' : 'rgba( 255, 255, 255, 0.05)',
            border: `1px solid ${isOn ? 'rgba( 107, 159, 255, 0.3)' : 'rgba( 255, 255, 255, 0.08)'}`,
            cursor: disabled ? 'not-allowed' : 'pointer', 
            opacity: disabled ? 0.4 : 1,        // 비활성화 시 흐리게
            marginBottom: '10px',
            // 클릭 시 살짝 줄어드는 효과 (scale)
            transform: pressed ? 'scale(0.97)' : 'scale(1)', transition: 'transform 0.15s',
        }}>
            {/* 왼쪽: 아이콘과 라벨 텍스트 영역 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                <span style={{ fontSize: '14px', color: '#e8e8f0' }}>{label}</span>
            </div>

            {/* 오른쪽: 실제 스위치 작동 UI (트랙과 원) */}
            <div style={{
                width: '46px', 
                height: '26px', 
                borderRadius: '13px',
                backgroundColor: isOn ? '#6b9fff' : 'rgba( 255, 255, 255, 0.15)',   // 상태에 따라 색상 전환
                position: 'relative',
                flexShrink: 0,
                transition: 'background-color 0.3s',    // 색상 변화를 부드럽게
            }}>
                {/* 스위치 내부의 움직이는 작은 원 */}
                <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',      // 수직 정중앙 정렬
                    left: isOn ? '23px' : '3px',        // 상태에 따라 좌우 위치 조정
                    transition: 'translateY(-50%)',     // 움직임을 부드럽게
                    boxShadow: '0 1px 3px rgba( 0, 0, 0, 0.3)',
                }} />
            </div>
        </div>
    );
}

export default Toggle;
