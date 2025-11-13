const fetch = require('node-fetch');

// 캐시 저장소 (30분간 유지)
const cache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30분

exports.handler = async (event, context) => {
    // CORS 헤더 설정
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // OPTIONS 요청 처리
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { lat, lon } = event.queryStringParameters || {};
        
        if (!lat || !lon) {
            throw new Error('위도(lat)와 경도(lon) 파라미터가 필요합니다.');
        }

        // 캐시 키 생성 (소수점 2자리까지만)
        const cacheKey = `${parseFloat(lat).toFixed(2)},${parseFloat(lon).toFixed(2)}`;
        
        // 캐시 확인
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            console.log('✅ 캐시에서 데이터 반환');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ...cached.data,
                    cached: true
                })
            };
        }

        // 기상청 API 키
        const kmaApiKey = 'fcIlOLe6RqCCJTi3ulag_A';
        
        // 현재 시간 (KST)
        const now = new Date();
        const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        
        // 시간 포맷
        const year = kstNow.getFullYear();
        const month = String(kstNow.getMonth() + 1).padStart(2, '0');
        const day = String(kstNow.getDate()).padStart(2, '0');
        const hour = String(kstNow.getHours()).padStart(2, '0');
        
        // 최근 2시간만 시도 (속도 개선)
        const times = [];
        for (let i = 0; i < 2; i++) {
            let h = parseInt(hour) - i;
            if (h < 0) h += 24;
            times.push(`${year}${month}${day}${String(h).padStart(2, '0')}00`);
        }
        
        // 김포 지역 관측소 (가까운 순서)
        const stations = ['201', '108']; // 김포, 서울
        
        console.log(`🌍 위치: (${lat}, ${lon})`);

        let weatherData = null;
        
        // 병렬로 모든 조합 시도 (속도 개선!)
        const promises = [];
        for (const stn of stations) {
            for (const tm of times) {
                const weatherUrl = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=${tm}&stn=${stn}&help=0&authKey=${kmaApiKey}`;
                
                promises.push(
                    fetch(weatherUrl, { timeout: 2000 }) // 2초로 단축
                        .then(response => response.text())
                        .then(textData => {
                            if (textData && textData.length > 100) {
                                const parsed = parseWeatherData(textData);
                                if (parsed.temp !== null) {
                                    parsed.station = stn;
                                    parsed.dataTime = tm;
                                    return parsed;
                                }
                            }
                            return null;
                        })
                        .catch(() => null)
                );
            }
        }

        // 첫 번째 성공한 결과 사용
        const results = await Promise.all(promises);
        weatherData = results.find(result => result !== null);

        if (weatherData) {
            console.log(`🎉 성공! 온도: ${weatherData.temp}°C`);
        }

        // 데이터 못 받았으면 기본값
        if (!weatherData || weatherData.temp === null) {
            console.warn('⚠️ 모든 시도 실패 - 기본값 사용');
            weatherData = getDefaultWeather();
        }

        const responseData = {
            success: true,
            location: {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                station: weatherData.station || 'unknown'
            },
            weather: {
                temp: weatherData.temp,
                humidity: weatherData.humidity,
                rain: weatherData.rain,
                windSpeed: weatherData.windSpeed,
                pressure: weatherData.pressure,
                description: weatherData.description,
                icon: weatherData.icon
            },
            timestamp: kstNow.toISOString()
        };

        // 캐시 저장
        cache.set(cacheKey, {
            data: responseData,
            timestamp: Date.now()
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        console.error('❌ Weather Function Error:', error);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                location: {
                    lat: parseFloat(event.queryStringParameters?.lat || 37.6),
                    lon: parseFloat(event.queryStringParameters?.lon || 126.7),
                    station: 'fallback'
                },
                weather: getDefaultWeather(),
                timestamp: new Date().toISOString()
            })
        };
    }
};

// 기상청 데이터 파싱
function parseWeatherData(textData) {
    const data = {
        temp: null,
        humidity: null,
        rain: 0,
        windSpeed: null,
        pressure: null,
        description: '맑음',
        icon: '☀️',
        station: null
    };

    if (!textData) return data;

    try {
        const lines = textData.trim().split('\n');
        
        // #으로 시작하지 않는 데이터 라인만 필터링
        const dataLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('#') && trimmed.length > 50;
        });

        if (dataLines.length === 0) return data;

        // 첫 번째 데이터 라인 사용 (가장 최근 데이터)
        const values = dataLines[0].trim().split(/\s+/);

        // 기상청 데이터 포맷:
        // 0: YYMMDDHHMI
        // 1: STN (관측소)
        // 2: WD (풍향)
        // 3: WS (풍속)
        // 11: TA (기온)
        // 12: TD (이슬점)
        // 13: HM (습도)
        // 15: RN (강수량)
        // 8: PS (해면기압)

        // 관측소
        if (values[1]) {
            data.station = values[1];
        }

        // 온도 (TA) - 인덱스 11
        if (values[11] && values[11] !== '-9.0' && values[11] !== '-') {
            const temp = parseFloat(values[11]);
            if (!isNaN(temp) && temp > -50 && temp < 50) {
                data.temp = temp;
            }
        }

        // 습도 (HM) - 인덱스 13
        if (values[13] && values[13] !== '-9.0' && values[13] !== '-') {
            const humidity = parseFloat(values[13]);
            if (!isNaN(humidity) && humidity >= 0 && humidity <= 100) {
                data.humidity = humidity;
            }
        }

        // 풍속 (WS) - 인덱스 3
        if (values[3] && values[3] !== '-9.0' && values[3] !== '-') {
            const windSpeed = parseFloat(values[3]);
            if (!isNaN(windSpeed) && windSpeed >= 0) {
                data.windSpeed = windSpeed;
            }
        }

        // 해면기압 (PS) - 인덱스 8
        if (values[8] && values[8] !== '-9.0' && values[8] !== '-') {
            const pressure = parseFloat(values[8]);
            if (!isNaN(pressure) && pressure > 900 && pressure < 1100) {
                data.pressure = pressure;
            }
        }

        // 강수량 (RN) - 인덱스 15
        if (values[15] && values[15] !== '-9.0' && values[15] !== '-') {
            const rain = parseFloat(values[15]);
            if (!isNaN(rain) && rain >= 0) {
                data.rain = rain;
            }
        }

        // 날씨 상태 결정
        if (data.rain > 0) {
            if (data.temp !== null && data.temp < 0) {
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
        } else if (data.humidity !== null) {
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

        console.log('📊 파싱 결과:', data);

    } catch (error) {
        console.error('❌ 파싱 오류:', error);
    }

    return data;
}

// 기본 날씨 (현재 시간 기반 합리적인 값)
function getDefaultWeather() {
    const now = new Date();
    const hour = now.getHours();
    const month = now.getMonth() + 1;
    
    // 계절별 평균 기온
    let baseTemp = 15;
    if (month >= 6 && month <= 8) baseTemp = 25; // 여름
    else if (month >= 12 || month <= 2) baseTemp = 0; // 겨울
    else if (month >= 3 && month <= 5) baseTemp = 12; // 봄
    else baseTemp = 15; // 가을
    
    // 시간대별 온도 변화
    const tempAdjust = Math.sin((hour - 6) * Math.PI / 12) * 5;
    
    return {
        temp: Math.round(baseTemp + tempAdjust),
        humidity: 60,
        rain: 0,
        windSpeed: 2.0,
        pressure: 1013,
        description: hour >= 6 && hour < 18 ? '맑음' : '흐림',
        icon: hour >= 6 && hour < 18 ? '☀️' : '☁️',
        station: 'default'
    };
}
