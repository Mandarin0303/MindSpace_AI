import React, { } from 'react';

/** 
 * MoonButton 컴포넌트 - 수면 시작/종료 메인 달 버튼
 * @param {boolean} isSleepMode - 현재 수면 모드 여부
 * @param {string} sleepStatus - 수면 준비 상태 ('idle', 'loading' 등)
 * @param {function} onClick - 버튼 클릭 핸들러
 * @param {string} label - 외부에서 주입하는 커스텀 라벨 (옵션)
 */

function MoonButton({ isSleepMode, sleepStatus, onClick, label }) {

    // 라벨 결정 로직: 외부 라벨 -> 수면 중 -> 수면 준비 중 -> 대기 중 순서
    const btnLabel = label || (
        isSleepMode 
            ? '수면 종료' 
            : sleepStatus === 'idle' 
                ? '수면 준비' 
                : '대기 중...'
    );

    return (
        <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            margin: '20px 0',
        }}>
        {/* 달 형태의 메인 버튼 영역 */}
            <div onClick={onClick} style={{
                width: '130px',
                height: '130px',
                borderRadius: '50%',
                // 상태에 따른 배경색 (노란색/파란색) 변경
                background: isSleepMode
                    ? 'radial-gradient(circle at 35% 35%, #f8e5a0, #e8b84b 50%, #c68f1a)'
                    : 'radial-gradient(circle at 35% 35%, #a8c8ff, #6b9fff 50%, #3a6fd8)',
                // 상태에 따른 글로우(Glow) 효과
                boxShadow: isSleepMode
                    ? '0 0 40px rgba( 232, 184, 75, 0.5), 0 0 80px rgba(232, 184, 75, 0.2)'
                    : '0 0 40px rgba( 107, 159, 255, 0.5), 0 0 80px rgba( 107, 159, 255, 0.2)',
                cursor: 'pointer',
                // 애니메이션: 수면 중엔 'breathe(숨쉬기)', 대기 중엔 'pulse(진동)'
                animation: isSleepMode ? 'breathe 4s ease-in-out infinite' : 'pulse 3s ease-in-out infinite',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: '0.5s',
            }}>
                {/* 이모지 아이콘 */}
                <span style={{ fontSize: '44px' }}>{isSleepMode ? '🌕' : '🌙'}</span>

                {/* 수면 모드일 때만 나타나는 회전 테두리(Orbit) 효과 */}
                {isSleepMode && (
                    <div style={{
                        position: 'absolute',
                        inset: '-8px',
                        borderRadius: '50%',
                        border: '2px solid rgba( 232, 184, 75, 0.3)',
                        animation: 'rotate 8s linear infinite',
                        borderTopColor: 'rgba( 232, 184, 75, 0.8)',
                    }} />
                )}
            </div>

            {/* 하단 캡션 텍스트 */}
            <p style={{ 
                marginTop: '10px', 
                fontSize: '12px', 
                opacity: 0.6, 
                letterSpacing: '0.1em'
            }}>
                {btnLabel}
            </p>
        </div>
    );
}

export default MoonButton;