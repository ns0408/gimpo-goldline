// ============================================================================
// 김포 골드라인 혼잡도 예측 API (V3.5 - Security Unlocked)
// ============================================================================

// CORS 헤더 설정 (모든 도메인 허용)
function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json; charset=utf-8'
    };
}

export async function onRequestGet(context) {
    const { request } = context;
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // 1. CORS Preflight 요청 처리
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(origin) });
    }

    try {
        // 2. data.json 로드
        // (주의: Cloudflare 내부에서 자신의 주소를 호출할 때 문제가 생길 수 있으므로,
        //  실패 시 빈 데이터를 반환하도록 예외 처리를 강화합니다.)
        let DATA;
        try {
            const dataUrl = `${url.origin}/data.json`;
            const dataResponse = await fetch(dataUrl);
            if (!dataResponse.ok) throw new Error('Failed to load data.json');
            DATA = await dataResponse.json();
        } catch (e) {
            // data.json 로드 실패 시 에러 반환
            return new Response(JSON.stringify({ 
                success: false, 
                message: 'System Error: Data file not found.', 
                debug: e.message 
            }), { status: 500, headers: corsHeaders(origin) });
        }

        // 3. 파라미터 파싱
        const station = url.searchParams.get('station');
        const direction = url.searchParams.get('direction') || '김포공항방면';
        let day = url.searchParams.get('day');
        
        // 현재 시간 (한국 시간 KST)
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
        const hour = url.searchParams.get('hour') || String(now.getHours()).padStart(2, '0');
        const minute = parseInt(url.searchParams.get('minute') || String(now.getMinutes()));
        
        // 4. 공휴일 자동 감지 로직
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${date}`;

        if (DATA.metadata && DATA.metadata.holidays) {
            if (DATA.metadata.holidays.includes(todayStr)) {
                const week = ['일', '월', '화', '수', '목', '금', '토'];
                const todayDayOfWeek = week[now.getDay()];
                if (day === todayDayOfWeek) {
                     day = '공휴일';
                }
            }
        }

        // 5. 유효성 검사
        if (!station || !DATA.timetable[station]) {
            return new Response(JSON.stringify({ success: false, message: 'Invalid station' }), { status: 400, headers: corsHeaders(origin) });
        }
        
        // 해당 요일 데이터가 없으면 토요일/일요일 데이터로 대체 시도 (안전장치)
        if (!DATA.usage[station][day]) {
             if (['토', '일', '공휴일'].includes(day)) {
                 // 데이터가 없는데 주말이라면, 혹시 '토'나 '일' 중 있는 것으로 대체
                 if (DATA.usage[station]['토']) day = '토';
                 else if (DATA.usage[station]['일']) day = '일';
             }
        }

        if (!DATA.usage[station][day]) {
            return new Response(JSON.stringify({ success: false, message: 'Data not found for this day' }), { status: 400, headers: corsHeaders(origin) });
        }

        // 6. 혼잡도 계산
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