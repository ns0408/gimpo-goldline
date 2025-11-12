const fetch = require('node-fetch');

// 머신러닝 예측 대신 규칙 기반 예측 사용
// (Netlify Functions에서 Python 모델 직접 실행은 제한적이므로)

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { station, datetime } = event.queryStringParameters || {};
        
        if (!station || !datetime) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: '역명(station)과 일시(datetime)가 필요합니다' 
                })
            };
        }

        // 날짜/시간 파싱
        const dt = new Date(datetime);
        const hour = dt.getHours();
        const dayOfWeek = dt.getDay(); // 0=일, 1=월, ...
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        // 날씨 정보 가져오기
        const weatherUrl = `/.netlify/functions/weather?datetime=${encodeURIComponent(datetime)}`;
        let weatherData = null;
        
        try {
            const weatherRes = await fetch(`${process.env.URL}${weatherUrl}`);
            const weatherJson = await weatherRes.json();
            if (weatherJson.success) {
                weatherData = weatherJson.weather;
            }
        } catch (error) {
            console.warn('⚠️ 날씨 정보 가져오기 실패:', error.message);
        }

        // 혼잡도 예측 (규칙 기반 + 과거 데이터 패턴)
        const prediction = predictCongestion(station, hour, dayOfWeek, isWeekend, weatherData);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                station,
                datetime,
                hour,
                dayOfWeek,
                isWeekend,
                weather: weatherData,
                prediction
            })
        };

    } catch (error) {
        console.error('❌ Prediction API Error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};

// 혼잡도 예측 함수 (규칙 기반)
function predictCongestion(station, hour, dayOfWeek, isWeekend, weather) {
    // 기본 승객 수 (과거 21일 데이터 평균 기반)
    const baselineByStation = {
        '김포공항': { base: 100, peak: 400 },
        '걸포북변': { base: 50, peak: 200 },
        '마산': { base: 80, peak: 300 },
        '장기': { base: 90, peak: 350 },
        '운양': { base: 70, peak: 250 },
        '사우': { base: 85, peak: 320 },
        '풍무': { base: 75, peak: 280 },
        '고촌': { base: 65, peak: 240 },
        '구래': { base: 60, peak: 220 },
        '양촌': { base: 55, peak: 200 },
        '양촌역': { base: 55, peak: 200 }
    };

    const stationData = baselineByStation[station] || { base: 70, peak: 250 };
    
    let predictedCount = stationData.base;

    // 1. 시간대 영향
    if (hour >= 7 && hour <= 9) {
        // 출근 시간대 (최대 혼잡)
        predictedCount = stationData.peak;
    } else if (hour >= 17 && hour <= 19) {
        // 퇴근 시간대 (두 번째 피크)
        predictedCount = stationData.peak * 0.9;
    } else if (hour >= 10 && hour <= 16) {
        // 낮 시간대 (중간)
        predictedCount = stationData.peak * 0.5;
    } else if (hour >= 20 && hour <= 22) {
        // 저녁 시간대
        predictedCount = stationData.peak * 0.4;
    } else {
        // 심야/새벽 (한산함)
        predictedCount = stationData.base * 0.2;
    }

    // 2. 요일 영향
    if (isWeekend) {
        // 주말은 평일 대비 70% 수준
        predictedCount *= 0.7;
        
        // 주말 오후는 상대적으로 더 붐빔
        if (hour >= 13 && hour <= 18) {
            predictedCount *= 1.3;
        }
    } else {
        // 평일
        if (dayOfWeek === 1) {
            // 월요일은 10% 더 혼잡
            predictedCount *= 1.1;
        } else if (dayOfWeek === 5) {
            // 금요일도 5% 더 혼잡
            predictedCount *= 1.05;
        }
    }

    // 3. 날씨 영향
    if (weather) {
        // 비가 오면 20% 증가 (대중교통 이용 증가)
        if (weather.rain > 0) {
            predictedCount *= 1.2;
        }
        
        // 폭염/한파 시 10% 증가
        if (weather.temp > 30 || weather.temp < 0) {
            predictedCount *= 1.1;
        }
        
        // 미세먼지 나쁨 시 5% 증가
        if (weather.pm10Grade && parseInt(weather.pm10Grade) >= 3) {
            predictedCount *= 1.05;
        }
    }

    // 4. 역별 특성 조정
    if (station === '김포공항') {
        // 공항역은 새벽/심야에도 이용객 많음
        if (hour >= 5 && hour <= 6) {
            predictedCount *= 2;
        }
    }

    // 정수로 반올림
    predictedCount = Math.round(predictedCount);

    // 혼잡도 레벨 계산 (1~10)
    const level = calculateCongestionLevel(predictedCount, stationData.peak);

    return {
        predictedCount,
        level,
        levelName: getLevelName(level),
        levelDescription: getLevelDescription(level),
        icon: getLevelIcon(level),
        color: getLevelColor(level)
    };
}

// 혼잡도 레벨 계산
function calculateCongestionLevel(count, peakCount) {
    const ratio = count / peakCount;
    
    if (ratio < 0.1) return 1;
    if (ratio < 0.2) return 2;
    if (ratio < 0.3) return 3;
    if (ratio < 0.4) return 4;
    if (ratio < 0.5) return 5;
    if (ratio < 0.6) return 6;
    if (ratio < 0.7) return 7;
    if (ratio < 0.8) return 8;
    if (ratio < 0.9) return 9;
    return 10;
}

// 혼잡도 레벨 이름
function getLevelName(level) {
    const names = ['', '한산함', '여유', '보통', '약간혼잡', '혼잡', '매우혼잡', '극심혼잡', '초만원', '지옥', '탑승불가'];
    return names[level] || '알 수 없음';
}

// 혼잡도 레벨 설명
function getLevelDescription(level) {
    const descriptions = {
        1: '💺 좌석이 많이 남아있어요',
        2: '😊 앉아서 갈 수 있어요',
        3: '👌 서서 가기 편해요',
        4: '🙂 약간 붐비지만 괜찮아요',
        5: '😐 승객이 많지만 탑승 가능해요',
        6: '😓 승객이 꽤 많아요',
        7: '😰 매우 혼잡해요',
        8: '😱 만원입니다',
        9: '🔥 지옥철 수준이에요',
        10: '🚫 탑승이 어려울 수 있어요'
    };
    return descriptions[level] || '알 수 없음';
}

// 혼잡도 아이콘
function getLevelIcon(level) {
    const icons = ['', '😌', '😊', '🙂', '😐', '😅', '😓', '😰', '😱', '🔥', '🚫'];
    return icons[level] || '❓';
}

// 혼잡도 색상
function getLevelColor(level) {
    const colors = ['', '#4CAF50', '#8BC34A', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#F44336', '#E91E63', '#9C27B0', '#000'];
    return colors[level] || '#999';
}