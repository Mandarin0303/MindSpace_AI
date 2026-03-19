import React, { useState } from 'react';

/**
 * 임시 더미 데이터 - Firebase 연동 후 onValue()로 교체 예정
 * CalendarHeatmap - 28일 수면 캘린더 히트맵
 * WeeklyChart - 최근 7일 수면 시간 바 차트
 * generateDummyHistory - 임시 더미 데이터 (추후 Firebase 교체)
 * 수면 & 명상 히스토리 시각화 전체 화면
 * - 주간 요약 (수면시간/품질/뒤척임/스트레스)
 * - 수면 품질 + 스트레스 지수 카드
 * - 7일 바 차트 + 28일 캘린더 히트맵
 * - AI 수면 분석 리포트
 * - 주간 스트레스 추이 차트
 */

// ------ 1.유틸리티 함수: 더미 데이터 생성 -----
// 28일치 데이터를 생성한다.
function generateDummyHistory() {
    const today = new Date();
    return Array.from({ length: 28 }, (_, i) => {
        const date = new Date(today);
        date.setDate(today.getDate() - (27 - i));
        const hasData = Math.random() > 0.3;        // 70% 확률로 데이터 존재
        return {
            date: date.toISOString().split('T')[0],
            duration: hasData ? Math.floor(Math.random() * 180 + 300) : 0,      // 수면 시간(분)
            motionCount: hasData ? Math.floor(Math.random() * 8) : 0,           // 뒤척임 횟수
            quality: hasData ? Math.floor(Math.random() * 40 + 60) : 0,         // 수면 점수
            stressLevel: hasData ? Math.floor(Math.random() * 4 + 1) : 0,       // 스트레스 레벨 (1~5)
        };
    });
};

// ----- 2. 서브 컴포넌트: 캘린더 히트맵 -----
function CalendarHeatmap({ data }) {
    const maxDuration = Math.max(...data.map(d => d.duration), 1);
    const weeks = [];
    for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));
    const days = ['일', '월', '화', '수', '목', '금', '토'];

    const getColor = (duration) => {
        if (!duration) return 'rgba( 255, 255, 255, 0.05)';
        const ratio = duration / maxDuration;
        if (ratio > 0.8) return '#6b9fff';
        if (ratio > 0.6) return '#5a8af0';
        if (ratio > 0.4) return '#4a75e0';
        if (ratio > 0.2) return 'rgba( 107, 159, 255, 0.4)';
        return 'rgba( 107, 159, 255, 0.2)';
    };
    
    return (
        <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
                {days.map(d => (
                    <div 
                        key={d}
                        style={{ flex: 1, textAlign: 'center', fontSize: '9px', opacity: 0.3 }}>
                        {d}</div>
                ))}
            </div>
            {weeks.map((week, wi) => (
                <div 
                    key={wi}
                    style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
                    {week.map((day, di) => (
                        <div key={di} 
                            title={`${day.date}: ${day.duration}m`} 
                            style={{
                                flex: 1, 
                                height: '28px', 
                                borderRadius: '4px',
                                backgroundColor: getColor(day.duration),
                                transition: '0.2s'
                            }} />
                    ))}
                </div>
            ))}
        </div>
    );
};

// ----- 3. 서브 컴포넌트: 주간 바 차트 -----
const WeeklyChart = ({ data }) => {
    const last7 = data.slice(-7);
    const maxDur = Math.max(...last7.map(d => d.duration), 1);
    return (
        <div style={{ marginTop: '10px' }}>
            <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '6px',
                height: '80px'
            }}>
                {last7.map((day, i) => {
                    const heightPct = day.duration ? (day.duration / maxDur) * 100 : 3;
                    return (
                        <div 
                            key={i}
                            style={{
                                flex: 1, 
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                height: '100%',
                                justifyContent: 'flex-end' }}>
                            {day.duration 
                                ? `${Math.floor(day.duration / 60)}h` : ''}
                            <div 
                                style={{
                                    width: '100%',
                                    borderRadius: '4px 4px 0 0',
                                    height: `${heightPct}%`,
                                    backgroundColor: day.duration
                                        ? '#6b9fff'
                                        : 'rgba( 255, 255, 255, 0.05)', 
                                    transition: '0.3s',
                                }} />
                        </div>
                    );
                })}
            </div>
            <div style={{
                display: 'flex',
                gap: '6px',
                marginTop: '6px'
            }}>
                {last7.map((day, i) => (
                    <div key={i}
                        style={{
                            flex: 1,
                            textAlign: 'center',
                            fontSize: '9px',
                            opacity: 0.4 }}>
                        {new Date(day.date).getDate()}
                    </div>
                ))}
            </div>
        </div>

    );
};

// ----- 4. 메인 리포트 컴포넌트 -----
function ReportMode() {
    const [history] = useState(generateDummyHistory());

    // 데이터 가공 및 평균값 계산 (버그 방지 로직 추가)
    const last7 = history.slice(-7);
    const validDays = last7.filter(d => d.duration > 0);
    const vLen = validDays.length || 1;      //0으로 나누기 방지

    const avgSleep = Math.round(validDays.reduce((s, d) => s + d.duration, 0) / vLen);
    const avgQuality = Math.round(validDays.reduce((s, d) => s + d.quality, 0) / vLen);
    const avgMotion = Math.round(validDays.reduce((s, d) => s + d.motionCount, 0) / vLen);
    const avgStress = (validDays.reduce((s, d) => s + d.stressLevel, 0) / vLen).toFixed(1);

    // 폼질 및 스트레스 레벨별 컬러/라벨 정의
    const getQualityInfo = (q) => {
        if (q >= 85) return { color: '#55efc4', label: '매우 좋음 😴' };
        if (q >= 70) return { color: '#74b9ff', label: '좋음 🙂' };
        if (q >= 55) return { color: '#ffeaa7', label: '보통 😐' };
        if (q >= 40) return { color: '#f39c12', label: '주의 😟' };
        return { color: '#ff7675', label: '나쁨 😟' };
    };

    // 스트레스 스타일 (기존 5단계 유지 및 인덱스 정렬)
    const stressStyles = {
        // 인덱스 1~5를 사용하기 위해 0번은 빈 값 처리
        colors: ['', '#55efc4', '#74b9ff', '#ffeaa7', '#f39c12', '#ff7675'],
        labels: ['', '매우 안정', '안정', '보통', '약간 높음', '높음']
    };

    const qInfo = getQualityInfo(avgQuality);
    const sIdx = Math.round(avgStress);

    return (
        <div style={{ animation: 'fadeIn 0.4s ease', paddingBottom: '20px' }}>
        
            {/* [카드] 주간 요약 통계 */}
            <div style={reportCardStyle}>
                <p style={cardLabelStyle}>주간 요약</p>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    {[
                        {label: '평균 수면', value: `${Math.floor(avgSleep / 60)}h ${avgSleep % 60}}m`},
                        {label: '수면 품질', value: `${avgQuality}점`},
                        {label: '평균 뒤척임', value: `${avgMotion}회`},
                        {label: '스트레스', value: `Lv.${avgStress}`},
                ].map((item, i) => (
                    <div key={i} style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#e8e8f0' }}>{item.value}</div>
                        <div style={{ fontSize: '10px', opacity: 0.4, marginTop: '4px' }}>{item.label}</div>
                    </div>
                ))}
                </div>
            </div>

            {/* [카드] 수면 품질 & 스트레스 (2열) */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <div style={halfCardStyle}>
                    <p style={miniLabelStyle}>수면 품질</p>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: qInfo.color }}>{avgQuality}</div>
                    <div style={{ fontSize: '10px', color: qInfo.color, marginTop: '4px' }}>{qInfo.label}</div>
                </div>
                <div style={halfCardStyle}>
                    <p style={miniLabelStyle}> 스트레스 지수</p>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: stressStyles.colors[sIdx] || '#74b9ff' }}>
                        Lv.{avgStress}
                    </div>
                    <div style={{ fontSize: '10px', color: stressStyles.colors[sIdx] || '#74b9ff', marginTop: '4px' }}>
                        {stressStyles.labels[sIdx] || '-'}
                    </div>
                </div>
            </div>
            {/* [차트] 최근 7일 수면 바 차트 */}
            <div style={reportCardStyle}>
                <p style={cardLabelStyle}>최근 7일 수면 시간</p>
                <WeeklyChart data={history} />
            </div>

            {/* [차트] 28일 히트맵 */}
            <div style={reportCardStyle}>
                <p style={cardLabelStyle}>수면 히스토리 (28일)</p>
                <CalendarHeatmap data={history} />
                {/* 범례 추가 */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    marginTop: '12px', 
                    justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '9px', opacity: 0.3 }}>적음</span>
                    {['rgba( 107, 159, 255, 0.2)', 'rgba( 107, 159, 255, 0.4)', '#4a75e0', '#5a8af0', '#6b9fff'].map((c, i) => (
                        <div key={i}
                            style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '2px',
                                backgroundColor: c }} />
                    ))}
                    <span style={{ fontSize: '9px', opacity: 0.3 }}>많음</span>
                </div>
            </div>
            
            {/* [AI 분석] 종합 판단 섹션 */}
            <div style={aiBoxStyle}>
                <p style={{ ...cardLabelStyle, color: '#a8c8ff', opacity: 1 }}>
                    🤖AI 수면 분석</p>
                <div style={{ fontSize: '13px', lineHeight: 1.7, opacity: 0.8, color: '#e8e8f0' }}>
                    {avgSleep >= 360 ? '✅ 수면 시간이 안정적입니다.' : '⚠️ 수면 시간이 다소 부족합니다.'}
                    <br />
                    {avgMotion <= 3 ? '✅ 매우 깊은 잠을 자고 있네요.' : '😐 뒤척임 완화를 위해 카페인을 줄여보세요.'}
                    <br />
                    {parseFloat(avgStress) <= 2.5 ? '✅ 심리적으로 아주 편안한 상태입니다.' : '⚠️ 명상 세션을 더 자주 진행해보세요.'}
                </div>
            </div>
        </div>
    );
} 

// ----- 공통 스타일 (VRMode와 통일) -----
const reportCardStyle = {
    backgroundColor: 'rgba( 255, 255, 255, 0.04)',
    borderRadius: '20px',
    border: '1px solid rgba( 255, 255, 255, 0.08)',
    padding: '18px',
    marginBottom: '14px',
};

const halfCardStyle = {
    flex: 1,
    backgroundColor: 'rgba( 255, 255, 255, 0.04)',
    borderRadius: '16px',
    border: '1px solid rgba( 255, 255, 255, 0.08)',
    padding: '16px',
    textAlign: 'center',
};

const cardLabelStyle = {
    fontSize: '11px',
    opacity: 0.4,
    letterSpacing: '0.15em',
    margin: '0 0 10px',
    textTransform: 'uppercase'
};

const miniLabelStyle = {
    fontSize: '10px',
    opacity: 0.4,
    margin: '0 0 8px',
    letterSpacing: '0.1em'
};

const aiBoxStyle = {
    backgroundColor: 'rgba( 107, 159, 255, 0.1)',
    borderRadius: '20px',
    border: '1px solid rgba( 107, 159, 255, 0.2)',
    padding: '18px',
    marginBottom: '14px',
};

export default ReportMode;
