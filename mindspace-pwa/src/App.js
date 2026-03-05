import React, { useEffect } from 'react';
import { useSleepMode } from "./hooks/useSleepMode";
//import { db } from './firebase';

function App() {
    const {
        isSleepMode,
        sleepStatus,
        motionCount,
        startSleepMode,
        stopSleepMode,
    } = useSleepMode();


    return (
        <div style={{ textAlign: 'center', marginTop: '100px', backgroundColor: isSleepMode ? '#fff' : '#2c3e50', color: isSleepMode ? '#000' : '#fff', height: '100vh', transition: '0.5s' }}>
            <h1>MindSpace VR 연동</h1>
            <div style={{ padding: '20px', border: '2px solid', display: 'inline-block', borderRadius: '15px' }}>
                <h2>{isSleepMode ? "수면 모드 중" : "VR 명상 중"}</h2>
                <p>상태: {sleepStatus}</p> 
                {isSleepMode && <p> 뒤척임 횟수: {motionCount}회 </p>} 
            </div>
            <br /><br />
            {/* 이 버튼이 Web Audio API 초기화 역할도 함 */}
            <button onClick={isSleepMode ? stopSleepMode : startSleepMode} style={{ padding: '10px 20px', fontSize: '16px' }}>
                {isSleepMode ? "수면 종료" : "수면 준비 (한 번 눌러주세요)"}
            </button>
        </div>
    );
}

export default App;
