import React from 'react';

/** 
 * 수면 중 세부 탭 - [수면] [컨트롤]
 * @param {Arry} tabs -{id, label} 형태의 객체 배열
 * @param {string} activeTab -현재 활성화된 탭의 ID
 * @param { Function } onTabChange -탭 클릭 시 실행할 상태 변경 함수
 */
     
function SubTab({ tabs, activeTab, onTabChange }) {
    return (
        // [레이아웃] 탭 전체 컨테이너
        <div 
            style={{
                display: 'flex',
                backgroundColor: 'rgba( 255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '4px',
                marginBottom: '16px',
            }}>
            {/* [렌더링] tabs 배열을 순회하며 각 탭 요소를 생성 */}
            {tabs.map(tab => (
                <div 
                    key={tab.id} 
                    onClick={() => onTabChange(tab.id)} 
                    style={{
                        flex: 1,                // 각 탭이 동일한 너비를 가짐
                        textAlign: 'center',
                        padding: '8px',
                        borderRadius: '9px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        // [동적 스타일] 선택된 탭과 일반 탭의 디자인 차별화
                        backgroundColor: activeTab === tab.id ? 'rgba( 107, 159, 255, 0.25)' : 'transparent',
                        color: activeTab === tab.id ? '#a8c8ff' : 'rgba( 255, 255, 255, 0.4)',
                        transition: '0.2s',     // 탭 전환 시 부드러운 애니메이션
                        fontWeight: activeTab === tab.id ? '600' : '400',
                    }}>
                    {tab.label}
                </div>
            ))}
        </div>
    );
}

export default SubTab;