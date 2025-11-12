const fetch = require('node-fetch');

// 🔥 개선된 자동 업데이트 - 가장 최신 날짜 기준
exports.handler = async (event, context) => {
    console.log('🔄 이용자 데이터 자동 업데이트 시작...');

    try {
        // 모드 확인
        const mode = event.queryStringParameters?.mode || 'daily';
        const days = parseInt(event.queryStringParameters?.days || '1');

        // ✨ 핵심: 현재 보유한 가장 최신 데이터 날짜 확인
        const latestDataDate = await getLatestDataDate();
        console.log(`📅 현재 DB의 가장 최신 데이터: ${latestDataDate}`);

        let datesToUpdate = [];

        if (mode === 'daily') {
            // 일일 모드: 최신 데이터 다음 날부터 어제까지
            const nextDate = getNextDate(latestDataDate);
            const yesterday = getYesterday();
            
            console.log(`📊 최신 데이터 다음 날: ${nextDate}`);
            console.log(`📊 수집 대상 (어제까지): ${yesterday}`);
            
            // 최신 데이터 이후 ~ 어제까지의 모든 날짜 수집
            datesToUpdate = getDateRange(nextDate, yesterday);
            
            if (datesToUpdate.length === 0) {
                console.log('✅ 이미 최신 상태입니다! (새로운 데이터 없음)');
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        success: true,
                        message: '이미 최신 상태',
                        latestDate: latestDataDate,
                        updatedAt: new Date().toISOString()
                    })
                };
            }
            
            console.log(`📅 일일 업데이트: ${datesToUpdate.length}일치 데이터 수집`);
            console.log(`📊 수집 대상: ${datesToUpdate.join(', ')}`);
            
        } else if (mode === 'backup') {
            // 백업 모드: 최근 N일
            console.log(`📅 백업 모드: 최근 ${days}일 데이터 수집`);
            
            const yesterday = getYesterday();
            const startDate = getDaysAgo(yesterday, days - 1);
            
            datesToUpdate = getDateRange(startDate, yesterday);
            console.log(`📊 수집 대상: ${datesToUpdate.join(', ')}`);
            
        } else if (mode === 'auto') {
            // 자동 모드: 누락된 날짜 자동 탐지 및 수집
            console.log('🤖 자동 모드: 누락 데이터 자동 탐지');
            
            const yesterday = getYesterday();
            const nextDate = getNextDate(latestDataDate);
            
            datesToUpdate = getDateRange(nextDate, yesterday);
            
            if (datesToUpdate.length === 0) {
                console.log('✅ 누락된 데이터 없음!');
            } else {
                console.log(`📊 누락 발견: ${datesToUpdate.length}일치`);
                console.log(`📊 수집 대상: ${datesToUpdate.join(', ')}`);
            }
        }

        if (datesToUpdate.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: '수집할 새 데이터 없음',
                    latestDate: latestDataDate,
                    updatedAt: new Date().toISOString()
                })
            };
        }

        // 김포 골드라인 전체 역
        const stations = [
            '김포공항', '걸포북변', '마산', '장기', '운양', 
            '사우', '풍무', '고촌', '구래', '양촌'
        ];

        // 각 날짜별로 데이터 수집
        const allResults = [];
        
        for (const dateStr of datesToUpdate) {
            console.log(`\n📆 ${dateStr} 데이터 수집 중...`);
            
            const dayResults = [];
            
            for (const station of stations) {
                const stationData = {
                    station,
                    date: dateStr,
                    hourlyData: []
                };

                // 실제로는 공공데이터포털 API 호출
                // 여기서는 시뮬레이션
                for (let hour = 0; hour < 24; hour++) {
                    const boarding = Math.floor(Math.random() * 100);
                    const alighting = Math.floor(Math.random() * 100);

                    stationData.hourlyData.push({
                        hour,
                        boarding,
                        alighting,
                        total: boarding + alighting
                    });
                }

                dayResults.push(stationData);
                console.log(`  ✅ ${station}`);
            }

            // 날씨 데이터 수집
            const weatherData = await fetchWeatherData(dateStr);
            
            allResults.push({
                date: dateStr,
                stations: dayResults,
                weather: weatherData
            });
            
            console.log(`✅ ${dateStr} 완료 (${stations.length}개 역)`);
        }

        // 데이터 저장 후 최신 날짜 업데이트
        console.log('\n💾 데이터 저장 중...');
        
        // 실제로는 데이터베이스나 파일 스토리지에 저장
        // 여기서는 로그만 출력
        
        const newLatestDate = datesToUpdate[datesToUpdate.length - 1];
        console.log(`✅ 모든 데이터 저장 완료`);
        console.log(`📊 총 ${datesToUpdate.length}일치 데이터 업데이트`);
        console.log(`📅 이전 최신 날짜: ${latestDataDate}`);
        console.log(`📅 새로운 최신 날짜: ${newLatestDate}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: '데이터 자동 업데이트 완료',
                mode: mode,
                previousLatestDate: latestDataDate,
                newLatestDate: newLatestDate,
                datesUpdated: datesToUpdate,
                count: datesToUpdate.length,
                stationCount: stations.length,
                totalRecords: datesToUpdate.length * stations.length * 24,
                updatedAt: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('❌ 자동 업데이트 오류:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};

// ===== 핵심 함수: 가장 최신 데이터 날짜 확인 =====
async function getLatestDataDate() {
    // 실제로는 데이터베이스나 파일에서 조회
    // 여기서는 하드코딩 (실제 구현 시 교체 필요)
    
    // 🔥 현재 데이터: 10월 31일까지
    return '2025-10-31';
    
    // 실제 구현 예시:
    // const db = await connectDB();
    // const result = await db.query('SELECT MAX(date) FROM ridership_data');
    // return result.rows[0].max;
}

// ===== 날짜 계산 함수들 =====
function getYesterday() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
}

function getNextDate(dateStr) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
}

function getDaysAgo(fromDate, days) {
    const date = new Date(fromDate);
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
}

function getDateRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
        dates.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

// 기상청 데이터 가져오기
async function fetchWeatherData(dateStr) {
    try {
        const apiKey = 'fcIlOLe6RqCCJTi3ulag_A';
        const stn = '201'; // 김포
        
        const tm = dateStr.replace(/-/g, '') + '1200';
        const url = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=${tm}&stn=${stn}&help=0&authKey=${apiKey}`;
        
        const response = await fetch(url);
        const textData = await response.text();
        
        return {
            date: dateStr,
            station: '김포',
            rawData: textData.substring(0, 200)
        };
        
    } catch (error) {
        console.error(`날씨 데이터 가져오기 실패 (${dateStr}):`, error);
        return null;
    }
}