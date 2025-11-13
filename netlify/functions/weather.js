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
        const { lat, lon } = event.queryStringParameters || {};
        
        if (!lat || !lon) {
            throw new Error('위도(lat)와 경도(lon) 파라미터가 필요합니다.');
        }

        // API 키
        const kmaApiKey = 'fcIlOLe6RqCCJTi3ulag_A';
        const airApiKey = '076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3';
        
        // 현재 시간 (KST)
        const now = new Date();
        const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        
        // 시간 포맷 (YYYYMMDDHHmm)
        const year = kstNow.getFullYear();
        const month = String(kstNow.getMonth() + 1).padStart(2, '0');
        const day = String(kstNow.getDate()).padStart(2, '0');
        const hour = String(kstNow.getHours()).padStart(2, '0');
        const tm = `${year}${month}${day}${hour}00`;
        
        // 김포 지역에 가장 가까운 관측소 (김포: 201, 서울: 108)
        const station = parseFloat(lat) > 37.6 ? '201' : '108'; // 김포 또는 서울
        
        console.log(`🌍 위치: (${lat}, ${lon})`);
        console.log(`📅 시간: ${tm}, 관측소: ${station}`);

        // 1. 기상청 APIHUB API 호출
        const weatherUrl = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=${tm}&stn=${station}&help=0&authKey=${kmaApiKey}`;
        
        // 2. 에어코리아 측정소 찾기
        const nearbyStationUrl = `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getNearbyMsrstnList?serviceKey=${encodeURIComponent(airApiKey)}&returnType=json&tmX=${lon}&tmY=${lat}&ver=1.0`;
        
        console.log('🌤️ 기상청 API 호출 중...');
        console.log('🏭 측정소 조회 중...');
        
        // API 병렬 호출
        const [weatherRes, stationRes] = await Promise.all([
            fetch(weatherUrl).then(r => r.text()).catch(err => {
                console.error('❌ 기상청 API 오류:', err);
                return null;
            }),
            fetch(nearbyStationUrl).then(r => r.json()).catch(err => {
                console.error('❌ 측정소 조회 오류:', err);
                return null;
            })
        ]);

        console.log('기상청 응답 (앞부분):', weatherRes ? weatherRes.substring(0, 200) : 'null');

        // 날씨 데이터 파싱
        const weatherData = parseWeatherData(weatherRes);
        
        // 측정소 이름 추출
        let stationName = '김포';
        if (stationRes?.response?.body?.items?.[0]) {
            stationName = stationRes.response.body.items[0].stationName;
            console.log(`📍 가장 가까운 측정소: ${stationName}`);
        }
        
        // 3. 미세먼지 실시간 데이터 조회
        const airUrl = `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${encodeURIComponent(airApiKey)}&returnType=json&numOfRows=1&pageNo=1&stationName=${encodeURIComponent(stationName)}&dataTerm=DAILY&ver=1.0`;
        
        console.log('💨 미세먼지 데이터 조회 중...');
        const airRes = await fetch(airUrl).then(r => r.json()).catch(() => null);
        const airData = parseAirData(airRes);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                location: {
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                    station: stationName,
                    weatherStation: station
                },
                weather: weatherData,
                air: airData,
                alerts: [],
                timestamp: kstNow.toISOString()
            })
        };

    } catch (error) {
        console.error('❌ Weather Function Error:', error);
        
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

// 기상청 데이터 파싱 (고정폭 텍스트 형식)
function parseWeatherData(textData) {
    const data = {
        temp: null,
        humidity: null,
        rain: 0,
        rainType: '없음',
        windSpeed: null,
        windDir: null,
        pressure: null,
        description: '정보 없음',
        icon: '❓'
    };

    if (!textData) {
        console.warn('⚠️ 기상청 데이터 없음');
        return data;
    }

    try {
        const lines = textData.trim().split('\n');
        
        if (lines.length < 2) {
            console.warn('⚠️ 기상청 데이터 형식 오류');
            return data;
        }

        // 헤더와 데이터 분리
        const header = lines[0].trim().split(/\s+/);
        const values = lines[lines.length - 1].trim().split(/\s+/);

        // 헤더-값 매핑
        const dataMap = {};
        header.forEach((key, index) => {
            if (values[index]) {
                dataMap[key] = values[index];
            }
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

        // 강수량 (RN)
        if (dataMap['RN']) {
            const rain = parseFloat(dataMap['RN']);
            data.rain = isNaN(rain) ? 0 : rain;
        }

        // 풍속 (WS)
        if (dataMap['WS']) {
            data.windSpeed = parseFloat(dataMap['WS']);
        }

        // 풍향 (WD)
        if (dataMap['WD']) {
            data.windDir = parseFloat(dataMap['WD']);
        }

        // 기압 (PS)
        if (dataMap['PS']) {
            data.pressure = parseFloat(dataMap['PS']);
        }

        // 날씨 상태 결정
        if (data.rain > 0) {
            if (data.temp !== null && data.temp < 0) {
                data.description = '눈';
                data.icon = '❄️';
                data.rainType = '눈';
            } else if (data.rain < 1) {
                data.description = '약한 비';
                data.icon = '🌦️';
                data.rainType = '비';
            } else if (data.rain < 3) {
                data.description = '비';
                data.icon = '🌧️';
                data.rainType = '비';
            } else {
                data.description = '강한 비';
                data.icon = '⛈️';
                data.rainType = '비';
            }
        } else {
            // 강수 없을 때 습도로 판단
            if (data.humidity !== null) {
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
            } else {
                // 습도 정보 없으면 기본값
                data.description = '맑음';
                data.icon = '☀️';
            }
        }

    } catch (error) {
        console.error('❌ 날씨 데이터 파싱 오류:', error);
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
            
            console.log('💨 미세먼지 데이터:', data);
        }
    } catch (error) {
        console.error('❌ 미세먼지 데이터 파싱 오류:', error);
    }

    return data;
}

// 폴백 날씨 데이터
function getFallbackWeather() {
    const hour = new Date().getHours();
    return {
        weather: {
            temp: 15,
            humidity: 60,
            rain: 0,
            rainType: '없음',
            windSpeed: 2.5,
            description: hour >= 6 && hour < 18 ? '맑음' : '흐림',
            icon: hour >= 6 && hour < 18 ? '☀️' : '☁️'
        },
        air: {
            pm10: '30',
            pm25: '15',
            pm10Description: '좋음',
            pm25Description: '좋음'
        },
        alerts: []
    };
}
