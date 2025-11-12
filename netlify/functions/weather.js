const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // CORS 헤더 설정
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // OPTIONS 요청 처리 (CORS preflight)
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { datetime } = event.queryStringParameters || {};
        
        // 새로운 기상청 APIHUB API KEY
        const apiKey = 'fcIlOLe6RqCCJTi3ulag_A';
        
        // 김포 지역 기상관측소 코드 (김포: 201)
        const stn = '201';
        
        // 날짜/시간 파라미터 처리
        let targetDatetime;
        if (datetime) {
            // 사용자가 입력한 일시 (예: 2025-10-15 14:30)
            targetDatetime = datetime.replace(/[-: ]/g, '');
        } else {
            // 현재 시간
            const now = new Date();
            now.setHours(now.getHours() + 9); // KST
            targetDatetime = now.toISOString()
                .slice(0, 16)
                .replace(/[-:T]/g, '');
        }
        
        // 시간자료 API URL
        const weatherUrl = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=${targetDatetime}&stn=${stn}&help=0&authKey=${apiKey}`;
        
        // 미세먼지 API (한국환경공단 - 기존 유지)
        const airApiKey = 'Ubxg+7JUSNS8YPuyVLjUNQ';
        const stationName = '김포';
        const airUrl = `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${encodeURIComponent(airApiKey)}&returnType=json&numOfRows=1&pageNo=1&stationName=${encodeURIComponent(stationName)}&dataTerm=DAILY&ver=1.0`;

        console.log('🌤️ 기상청 API 호출:', weatherUrl);
        
        // API 호출
        const [weatherRes, airRes] = await Promise.all([
            fetch(weatherUrl).then(r => r.text()),
            fetch(airUrl).then(r => r.json()).catch(() => null)
        ]);

        console.log('✅ 기상청 응답:', weatherRes.substring(0, 200));

        // 기상청 데이터 파싱 (고정폭 텍스트 포맷)
        const weatherData = parseKMAData(weatherRes);
        const airData = parseAirData(airRes);
        const alerts = await getWeatherAlerts();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                datetime: targetDatetime,
                weather: weatherData,
                air: airData,
                alerts: alerts,
                location: {
                    station: '김포',
                    stn: stn
                }
            })
        };

    } catch (error) {
        console.error('❌ Weather API Error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                fallback: getFallbackWeather()
            })
        };
    }
};

// 기상청 APIHUB 데이터 파싱 (고정폭 텍스트)
function parseKMAData(textData) {
    const data = {
        temp: null,
        humidity: null,
        rain: 0,
        windSpeed: null,
        pressure: null,
        description: '정보 없음',
        icon: '❓'
    };

    try {
        // 줄바꿈으로 분리
        const lines = textData.trim().split('\n');
        
        if (lines.length < 2) {
            console.warn('⚠️ 기상청 데이터 형식 오류');
            return data;
        }

        // 헤더와 데이터 행 분리
        const header = lines[0].trim().split(/\s+/);
        const values = lines[lines.length - 1].trim().split(/\s+/);

        // 헤더-값 매핑
        const dataMap = {};
        header.forEach((key, index) => {
            dataMap[key] = values[index];
        });

        console.log('📊 파싱된 기상 데이터:', dataMap);

        // 온도 (TA)
        if (dataMap['TA']) {
            data.temp = parseFloat(dataMap['TA']);
        }

        // 습도 (HM)
        if (dataMap['HM']) {
            data.humidity = parseFloat(dataMap['HM']);
        }

        // 강수량 (RN) - 1시간 강수량
        if (dataMap['RN']) {
            const rain = parseFloat(dataMap['RN']);
            data.rain = isNaN(rain) ? 0 : rain;
        }

        // 풍속 (WS)
        if (dataMap['WS']) {
            data.windSpeed = parseFloat(dataMap['WS']);
        }

        // 기압 (PS)
        if (dataMap['PS']) {
            data.pressure = parseFloat(dataMap['PS']);
        }

        // 날씨 상태 결정
        if (data.rain > 0) {
            if (data.temp < 0) {
                data.description = '눈';
                data.icon = '❄️';
            } else if (data.rain < 1) {
                data.description = '약한 비';
                data.icon = '🌦️';
            } else if (data.rain < 3) {
                data.description = '비';
                data.icon = '🌧️';
            } else {
                data.description = '강한 비';
                data.icon = '⛈️';
            }
        } else {
            // 구름양 (운량) 정보가 없으면 온도와 습도로 판단
            if (data.humidity > 80) {
                data.description = '흐림';
                data.icon = '☁️';
            } else if (data.humidity > 60) {
                data.description = '구름많음';
                data.icon = '⛅';
            } else {
                data.description = '맑음';
                data.icon = '☀️';
            }
        }

    } catch (error) {
        console.error('❌ 기상 데이터 파싱 오류:', error);
    }

    return data;
}

// 미세먼지 데이터 파싱
function parseAirData(airRes) {
    const data = {
        pm10: null,
        pm25: null,
        pm10Grade: null,
        pm25Grade: null,
        pm10Description: '정보 없음',
        pm25Description: '정보 없음'
    };

    try {
        if (airRes?.response?.body?.items?.[0]) {
            const item = airRes.response.body.items[0];
            data.pm10 = item.pm10Value;
            data.pm25 = item.pm25Value;
            data.pm10Grade = item.pm10Grade;
            data.pm25Grade = item.pm25Grade;

            // 등급별 설명
            const gradeDesc = ['좋음', '보통', '나쁨', '매우나쁨'];
            if (data.pm10Grade) data.pm10Description = gradeDesc[parseInt(data.pm10Grade) - 1] || '정보없음';
            if (data.pm25Grade) data.pm25Description = gradeDesc[parseInt(data.pm25Grade) - 1] || '정보없음';
        }
    } catch (error) {
        console.error('❌ 미세먼지 데이터 파싱 오류:', error);
    }

    return data;
}

// 기상특보 조회
async function getWeatherAlerts() {
    try {
        const apiKey = 'Ubxg+7JUSNS8YPuyVLjUNQ';
        const url = `http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=10&pageNo=1&dataType=JSON`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        const alerts = [];
        
        if (data?.response?.body?.items?.item) {
            const items = Array.isArray(data.response.body.items.item) 
                ? data.response.body.items.item 
                : [data.response.body.items.item];
            
            items.forEach(item => {
                // 김포/경기 지역만 필터링
                if (item.areaName && (item.areaName.includes('김포') || item.areaName.includes('경기'))) {
                    alerts.push({
                        type: item.warnVar,
                        level: item.warnStress,
                        area: item.areaName,
                        issue: item.tmFc,
                        description: getAlertDescription(item.warnVar)
                    });
                }
            });
        }
        
        return alerts;
    } catch (error) {
        console.error('❌ 기상특보 조회 오류:', error);
        return [];
    }
}

// 특보 종류별 설명
function getAlertDescription(type) {
    const descriptions = {
        '태풍': '🌀 태풍',
        '호우': '🌧️ 호우',
        '강풍': '💨 강풍',
        '풍랑': '🌊 풍랑',
        '대설': '❄️ 대설',
        '한파': '🥶 한파',
        '폭염': '🥵 폭염',
        '건조': '🔥 건조',
        '황사': '😷 황사',
        '폭풍해일': '🌊 폭풍해일'
    };
    return descriptions[type] || `⚠️ ${type}`;
}

// 폴백 날씨 데이터
function getFallbackWeather() {
    const hour = new Date().getHours();
    return {
        weather: {
            temp: 15 + Math.random() * 10,
            humidity: 50 + Math.random() * 30,
            rain: 0,
            windSpeed: 2 + Math.random() * 3,
            pressure: 1013,
            description: hour >= 6 && hour < 18 ? '맑음' : '흐림',
            icon: hour >= 6 && hour < 18 ? '☀️' : '☁️'
        },
        air: {
            pm10: '25',
            pm25: '15',
            pm10Description: '좋음',
            pm25Description: '좋음'
        },
        alerts: []
    };
}