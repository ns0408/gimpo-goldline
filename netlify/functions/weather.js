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
        
        // 위경도를 기상청 격자 좌표로 변환
        const grid = convertToGrid(parseFloat(lat), parseFloat(lon));
        
        // 현재 시간 (KST)
        const now = new Date();
        const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        
        // 초단기실황은 매시간 정시+10분에 생성
        const baseDate = formatDate(kstNow);
        const baseTime = formatTime(kstNow);
        
        console.log(`🌍 위치: (${lat}, ${lon}) → 격자: (${grid.nx}, ${grid.ny})`);
        console.log(`📅 기준시간: ${baseDate} ${baseTime}`);

        // 1. 기상청 초단기실황 API 호출 (공공데이터포털 방식)
        const weatherUrl = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${encodeURIComponent(airApiKey)}&numOfRows=10&pageNo=1&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${grid.nx}&ny=${grid.ny}`;
        
        // 2. 에어코리아 측정소 찾기
        const nearbyStationUrl = `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getNearbyMsrstnList?serviceKey=${encodeURIComponent(airApiKey)}&returnType=json&tmX=${lon}&tmY=${lat}&ver=1.0`;
        
        console.log('🌤️ 초단기실황 API 호출 중...');
        console.log('🏭 측정소 조회 중...');
        
        // API 병렬 호출
        const [weatherRes, stationRes] = await Promise.all([
            fetch(weatherUrl).then(r => r.json()).catch(err => {
                console.error('❌ 초단기실황 API 오류:', err);
                return null;
            }),
            fetch(nearbyStationUrl).then(r => r.json()).catch(err => {
                console.error('❌ 측정소 조회 오류:', err);
                return null;
            })
        ]);

        console.log('날씨 API 응답:', JSON.stringify(weatherRes).substring(0, 200));

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
        
        // 4. 기상특보는 간소화 (선택사항)
        const alerts = [];

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                location: {
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                    grid: grid,
                    station: stationName
                },
                weather: weatherData,
                air: airData,
                alerts: alerts,
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

// 위경도를 기상청 격자 좌표로 변환
function convertToGrid(lat, lon) {
    const RE = 6371.00877;
    const GRID = 5.0;
    const SLAT1 = 30.0;
    const SLAT2 = 60.0;
    const OLON = 126.0;
    const OLAT = 38.0;
    const XO = 43;
    const YO = 136;

    const DEGRAD = Math.PI / 180.0;

    const re = RE / GRID;
    const slat1 = SLAT1 * DEGRAD;
    const slat2 = SLAT2 * DEGRAD;
    const olon = OLON * DEGRAD;
    const olat = OLAT * DEGRAD;

    let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = re * sf / Math.pow(ro, sn);

    let ra = Math.tan(Math.PI * 0.25 + (lat) * DEGRAD * 0.5);
    ra = re * sf / Math.pow(ra, sn);
    let theta = lon * DEGRAD - olon;
    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;
    theta *= sn;

    const x = Math.floor(ra * Math.sin(theta) + XO + 0.5);
    const y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

    return { nx: x, ny: y };
}

// 날짜 포맷 (YYYYMMDD)
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// 시간 포맷 (HHMM) - 초단기실황용
function formatTime(date) {
    let hour = date.getHours();
    const minute = date.getMinutes();
    
    // 초단기실황은 매시 정시+10분에 생성 (정시 기준)
    // 10분 이전이면 이전 시간 사용
    if (minute < 10) {
        hour = hour - 1;
        if (hour < 0) hour = 23;
    }
    
    return String(hour).padStart(2, '0') + '00';
}

// 초단기실황 데이터 파싱 (공공데이터포털 JSON 형식)
function parseWeatherData(response) {
    const data = {
        temp: null,
        humidity: null,
        rain: 0,
        rainType: '없음',
        windSpeed: null,
        windDir: null,
        description: '정보 없음',
        icon: '❓'
    };

    if (!response) {
        console.warn('⚠️ 초단기실황 데이터 없음');
        return data;
    }

    try {
        const items = response?.response?.body?.items?.item;
        
        if (!items || items.length === 0) {
            console.warn('⚠️ 초단기실황 데이터 형식 오류');
            return data;
        }

        // 카테고리별로 데이터 추출
        items.forEach(item => {
            const category = item.category;
            const obsValue = item.obsrValue;
            
            switch (category) {
                case 'T1H': // 기온
                    data.temp = parseFloat(obsValue);
                    break;
                case 'RN1': // 1시간 강수량
                    data.rain = parseFloat(obsValue) || 0;
                    break;
                case 'REH': // 습도
                    data.humidity = parseFloat(obsValue);
                    break;
                case 'PTY': // 강수형태
                    const ptyCode = parseInt(obsValue);
                    const ptyMap = {
                        0: '없음',
                        1: '비',
                        2: '비/눈',
                        3: '눈',
                        5: '빗방울',
                        6: '빗방울눈날림',
                        7: '눈날림'
                    };
                    data.rainType = ptyMap[ptyCode] || '없음';
                    break;
                case 'WSD': // 풍속
                    data.windSpeed = parseFloat(obsValue);
                    break;
                case 'VEC': // 풍향
                    data.windDir = parseFloat(obsValue);
                    break;
            }
        });

        console.log('📊 파싱된 날씨 데이터:', data);

        // 날씨 상태 및 아이콘 결정
        if (data.rainType !== '없음') {
            if (data.rainType.includes('눈')) {
                data.description = data.rainType;
                data.icon = '❄️';
            } else {
                if (data.rain < 1) {
                    data.description = '약한 비';
                    data.icon = '🌦️';
                } else if (data.rain < 3) {
                    data.description = '비';
                    data.icon = '🌧️';
                } else {
                    data.description = '강한 비';
                    data.icon = '⛈️';
                }
            }
        } else {
            // 강수가 없을 때 습도로 판단
            if (data.humidity && data.humidity > 80) {
                data.description = '흐림';
                data.icon = '☁️';
            } else if (data.humidity && data.humidity > 60) {
                data.description = '구름많음';
                data.icon = '⛅';
            } else {
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
