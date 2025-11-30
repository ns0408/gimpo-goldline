// ============================================================================
// 김포 골드라인 혼잡도 예측 API (V3.4 - Smart Holiday Detection)
// ============================================================================

const ALLOWED_ORIGINS = [
    'https://gimpo-goldline.pages.dev',
    'http://localhost:8788',
    'http://127.0.0.1:8788'
];

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : 'null',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json; charset=utf-8'
    };
}

export async function onRequestGet(context) {
    const { request } = context;
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(origin) });
    }
    if (!ALLOWED_ORIGINS.includes(origin) && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
        return new Response(JSON.stringify({ error: 'Unauthorized Domain' }), { status: 403, headers: corsHeaders(origin) });
    }

    try {
        // 1. data.json 로드
        const dataUrl = `${url.origin}/data.json`;
        const dataResponse = await fetch(dataUrl);
        if (!dataResponse.ok) throw new Error('Failed to load data.json');
        const DATA = await dataResponse.json();

        // 2. 파라미터 파싱
        const station = url.searchParams.get('station');
        const direction = url.searchParams.get('direction') || '김포공항방면';
        let day = url.searchParams.get('day'); // 클라이언트가 요청한 요일 (예: '월')
        
        // 3. 현재 시간 (한국 시간 KST) 계산
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
        const hour = url.searchParams.get('hour') || String(now.getHours()).padStart(2, '0');
        const minute = parseInt(url.searchParams.get('minute') || String(now.getMinutes()));
        
        // ====================================================================
        // ⚠️ [V3.4 핵심] 공휴일 자동 감지 로직
        // ====================================================================
        // 오늘 날짜를 YYYY-MM-DD 형식으로 변환
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${date}`;

        // data.json의 메타데이터에 있는 공휴일 목록 확인
        if (DATA.metadata && DATA.metadata.holidays) {
            if (DATA.metadata.holidays.includes(todayStr)) {
                // 오늘이 공휴일 목록에 있다면, 사용자의 선택과 상관없이 '공휴일' 모델 적용
                // (단, 사용자가 명시적으로 다른 날짜를 찍어서 조회하는 기능이 있다면 이 로직은 조정 필요.
                //  현재는 '오늘' 위주의 앱이므로 자동 적용이 합리적임)
                
                // 만약 클라이언트가 요청한 요일이 '오늘의 요일'과 같다면 (즉, 오늘을 조회 중이라면)
                // day 변수를 '공휴일'로 덮어씀
                const week = ['일', '월', '화', '수', '목', '금', '토'];
                const todayDayOfWeek = week[now.getDay()];
                
                if (day === todayDayOfWeek) {
                     day = '공휴일';
                }
            }
        }
        // ====================================================================

        // 4. 유효성 검사
        if (!station || !DATA.timetable[station]) {
            return new Response(JSON.stringify({ success: false, message: 'Invalid station' }), { status: 400, headers: corsHeaders(origin) });
        }
        if (!DATA.usage[station] || !DATA.usage[station][day]) {
            return new Response(JSON.stringify({ success: false, message: 'Data not found for this day' }), { status: 400, headers: corsHeaders(origin) });
        }

        // 5. 혼잡도 계산
        const trains = findNext(station, direction, day, hour, minute, DATA);
        
        if (!trains || trains.length === 0) {
            return new Response(JSON.stringify({ success: true, message: '운행 종료', data: [] }), { status: 200, headers: corsHeaders(origin) });
        }

        const trainInfo = trains.map(train => {
            const hourStr = String(train.h).padStart(2, '0');
            const cong = calcCong(station, direction, day, hourStr, DATA);
            return {
                time: `${hourStr}:${String(train.m).padStart(2, '0')}`,
                congestion: cong.pct,
                level: getLv(cong.pct),
                message: cong.msg
            };
        });

        return new Response(JSON.stringify({ success: true, data: { trains: trainInfo } }), { status: 200, headers: corsHeaders(origin) });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders(origin) });
    }
}

// Helper Functions
function findNext(station, direction, day, currentHour, currentMinute, DATA) {
    const timetable = DATA.timetable[station][direction];
    if (!timetable) return [];
    
    // 공휴일은 '토일' 시간표를 사용한다고 가정
    let timeKey = '평일';
    if (['토', '일', '공휴일'].includes(day)) timeKey = '토일';
    
    const schedule = timetable[timeKey];
    if (!schedule) return [];

    let trains = [];
    let h = parseInt(currentHour);
    let m = currentMinute;
    let count = 0;
    
    for (let i = 0; i < 3; i++) {
        let hourKey = String(h).padStart(2, '0');
        if (schedule[hourKey]) {
            for (let t of schedule[hourKey]) {
                if (t.minute > m || (i > 0)) {
                    trains.push({ h: h, m: t.minute });
                    count++;
                    if (count >= 3) break;
                }
            }
        }
        if (count >= 3) break;
        h++; m = -1; if (h > 24) break; 
    }
    return trains;
}

function calcCong(station, direction, day, hour, DATA) {
    const usage = DATA.usage[station][day];
    if (!usage || !usage[hour]) return { pct: 0, msg: "정보 없음" };
    
    const on = usage[hour]['승차'];
    const off = usage[hour]['하차'];
    const currentLoad = on - off;
    let congestion = Math.round((Math.max(0, currentLoad) / 300) * 100);
    if (congestion < 0) congestion = 0;
    return { pct: congestion, msg: "" };
}

function getLv(pct) {
    if (pct >= 150) return "지옥";
    if (pct >= 100) return "매우 혼잡";
    if (pct >= 70) return "혼잡";
    if (pct >= 40) return "보통";
    return "여유";
}