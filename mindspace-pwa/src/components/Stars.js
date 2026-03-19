import React, { useRef } from 'react';      

/**
 * [배경 컴포넌트] 별 반짝임 배경 + 전체 CSS 애니메이션 keyframes 정의
 */

function Stars() {
    // 1.별 데이터를 생성 - useRef를 사용한 이유는 컴포넌트가 다시 그려져도 별들의 위치가 바뀌지 않게 고정하기 위해서이다.
    const stars = useRef(
        Array.from({ length: 60 }, (_, i) => ({
            id: i,                              // 각 별을 구분하기 위한 고유 번호
            x: Math.random() * 100,             // 화면 가로 위치 (0 ~ 100%)
            y: Math.random() * 100,             // 화면 세로 위치 (0 ~ 100%)
            size: Math.random() * 2 + 0.5,      // 별 크기 (0.5px ~ 2.5px)
            opacity: Math.random() * 0.6 + 0.2, // 투명도 (반짝임 정도)
            delay: Math.random() * 3,           // 별마다 반짝이는 시간을 다르게 함
        }))
    ).current;       // .current를 붙여 실제 저장된 데이터를 가져온다.
    
    return (
        // 2. 화면 전체를 덮는 투명한 박스 생성
        <div 
            style={{ 
                position: 'fixed', 
                inset: 0, 
                pointerEvents: 'none',
                zIndex: 0
            }}
        >
            {/* 3. map() 함수를 사용하여 별 60개{length:60} 를 하나씩 화면에 뿌린다. */}
            {stars.map(s => (
                <div 
                    key={s.id} 
                    style={{
                        position: 'absolute', 
                        left: `${s.x}%`, 
                        top: `${s.y}%`,
                        width: `${s.size}px`, 
                        height: `${s.size}px`,
                        borderRadius: '50%', 
                        backgroundColor: '#fff',
                        opacity: s.opacity, 
                        animation: `twinkle 3s ${s.delay}s infinite alternate`,
                    }} 
                />
            ))}

            <style>{`
                /* 반짝이는 효과: 투명도가 0.에서 0.8까지 변함 */
                @keyframes twinkle { 
                    from { opacity: 0.1; } 
                    to { opacity: 0.8; } 
                }

                /* 기타 컴포넌트에서 공통으로 사용할 수 있는 애니메이션들 */
                @keyframes pulse { 
                    0%, 100% {transform: scale(1); opacity: 0.8; } 
                    50% {transform: scale(1.05); opacity: 1;} 
                }

                @keyframes fadeIn { 
                    from { opacity: 0; transform: translateY(10px); } 
                    to { opacity: 1; transform: translateY(0); } 
                }
                
                @keyframes breathe { 
                    0%, 100% { transform: scale(1); } 
                    50% { transform: scale(1.08); } 
                }

                @keyframes rotate { 
                    from { transform: rotate(0deg); } 
                    to { transform: rotate(360deg); } 
                }

                @keyframes slideUp { 
                    from { opacity: 0; transform: translateY(20px); } 
                    to { opacity: 1; transform: translateY(0); } 
                }
            `}</style>
        </div>
    );
}

export default Stars;