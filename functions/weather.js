// functions/weather.js
// Cloudflare Pages Functions 네이티브 형식

// 캐시 저장소 (Cloudflare Workers KV 사용 가능하지만, 여기서는 메모리 캐시)
const cache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30분

// GET 요청 처리
export async function onRequestGet(context) {
    const { request } = context;
    const url = new URL(request.url);
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');
    
    // CORS 헤더
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    
    try {
        if (!lat || !lon) {
            return new Response(JSON.stringify({
                success: false,
                error: '위도(lat)와 경도(lon) 파라미터가 필요합니다.'
            }), { status: 400, headers });
        }
        
        // 캐시 키 생성
        const cacheKey = `${parseFloat(lat).toFixed(2)},${parseFloat(lon).toFixed(2)}`;
        
        // 캐시 확인
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            console.log('✅ 캐시에서 데이터 반환');
            return new Response(JSON.stringify({
                ...cached.data,
                cached: true
            }), { status: 200, headers });
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
        
        // 최근 2시간만 시도
        const times = [];
        for (let i = 0; i < 2; i++) {
            let h = parseInt(hour) - i;
            if (h < 0) h += 24;
            times.push(`${year}${month}${day}${String(h).padStart(2, '0')}00`);
        }
        
        // 김포 지역 관측소
        const stations = ['201', '108']; // 김포, 서울
        
        console.log(`🌍 위치: (${lat}, ${lon})`);
        
        let weatherData = null;
        
        // 병렬로 모든 조합 시도
        const promises = [];
        for (const stn of stations) {
            for (const tm of times) {
                const weatherUrl = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=${tm}&stn=${stn}&help=0&authKey=${kmaApiKey}`;
                
                promises.push(
                    fetch(weatherUrl, { 
                        signal: AbortSignal.timeout(2000) // 2초 타임아웃
                    })
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
        
        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers
        });
        
    } catch (error) {
        console.error('❌ Weather Function Error:', error);
        
        // 에러 시에도 기본 날씨 데이터 반환
        const fallbackData = {
            success: true,
            location: {
                lat: parseFloat(lat || 37.6),
                lon: parseFloat(lon || 126.7),
                station: 'fallback'
            },
            weather: getDefaultWeather(),
            timestamp: new Date().toISOString()
        };
        
        return new Response(JSON.stringify(fallbackData), {
            status: 200,
            headers
        });
    }
}

// OPTIONS 요청 처리 (CORS preflight)
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

// ============================================
// 기상청 데이터 파싱
// ============================================
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
        
        // 첫 번째 데이터 라인 사용
        const values = dataLines[0].trim().split(/\s+/);
        
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

// ============================================
// 기본 날씨
// ============================================
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
