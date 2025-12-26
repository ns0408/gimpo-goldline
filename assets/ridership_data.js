// [Data] 김포골드라인 역별/시간대별 승하차 데이터 (Mock for Simulation)
// 단위: 명 (시간당 총원)
// 출처: 경기데이터드림 (2024년 11월 평일 기준 평균값 유사하게 구성)

window.RIDERSHIP_DATA = {
    "양촌": {
        7: { board: 600, alight: 50 },
        8: { board: 900, alight: 100 },
        9: { board: 400, alight: 80 },
        18: { board: 100, alight: 500 },
        19: { board: 50, alight: 300 }
    },
    "구래": {
        7: { board: 4500, alight: 300 },
        8: { board: 5800, alight: 500 },
        9: { board: 3000, alight: 400 },
        18: { board: 1200, alight: 3500 },
        19: { board: 800, alight: 2800 }
    },
    "마산": {
        7: { board: 1800, alight: 200 },
        8: { board: 2300, alight: 300 },
        9: { board: 1200, alight: 200 },
        18: { board: 400, alight: 1500 },
        19: { board: 300, alight: 1100 }
    },
    "장기": {
        7: { board: 2500, alight: 400 },
        8: { board: 3200, alight: 600 },
        9: { board: 1800, alight: 500 },
        18: { board: 700, alight: 2200 },
        19: { board: 500, alight: 1800 }
    },
    "운양": {
        7: { board: 2800, alight: 300 },
        8: { board: 3500, alight: 500 },
        9: { board: 2000, alight: 400 },
        18: { board: 600, alight: 2400 },
        19: { board: 400, alight: 1900 }
    },
    "걸포북변": {
        7: { board: 2200, alight: 400 },
        8: { board: 2800, alight: 600 },
        9: { board: 1500, alight: 500 },
        18: { board: 500, alight: 2000 },
        19: { board: 300, alight: 1500 }
    },
    "사우(김포시청)": {
        7: { board: 2000, alight: 800 },
        8: { board: 2500, alight: 1200 },
        9: { board: 1400, alight: 900 },
        18: { board: 800, alight: 1500 },
        19: { board: 600, alight: 1000 }
    },
    "풍무": {
        7: { board: 3800, alight: 600 },
        8: { board: 4800, alight: 800 },
        9: { board: 2500, alight: 700 },
        18: { board: 1000, alight: 3000 },
        19: { board: 700, alight: 2400 }
    },
    "고촌": {
        7: { board: 1500, alight: 400 },
        8: { board: 1900, alight: 500 },
        9: { board: 1000, alight: 400 },
        18: { board: 300, alight: 1200 },
        19: { board: 200, alight: 900 }
    },
    "김포공항": {
        7: { board: 300, alight: 8000 }, // 대부분 하차
        8: { board: 400, alight: 11000 },
        9: { board: 400, alight: 6000 },
        18: { board: 6000, alight: 1000 }, // 퇴근길 승차 시작
        19: { board: 4500, alight: 500 }
    }
};

// 기본값 채우기 (데이터 없는 시간대용)
function getRidership(station, hour) {
    const data = window.RIDERSHIP_DATA[station];
    if (data && data[hour]) {
        return data[hour];
    }
    // 평시(Normal) 기본값 시뮬레이션
    return { board: 200, alight: 200 };
}