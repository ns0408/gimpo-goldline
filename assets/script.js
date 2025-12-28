// =============================================================================
// [설정] 클라우드플레어 워커 API 주소
// =============================================================================
const API_URL = '/predict';

// [보안] 우클릭 및 개발자 도구 차단
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
    if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
    }
});

// =============================================================================
// [설정] 외부 데이터 연결
// =============================================================================
const EXCEL_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSq81HMVjbPw_qiSWDPoUtWUC2RNPsaCLB-_3ZK-DWGCX7Jbn1dmDJk74w35h78Y30aSgZR-u0NjTOW/pub?output=csv";
const SCHEDULE_URL = "assets/schedule.csv";

// =============================================================================
// [데이터] 기본 데이터
// =============================================================================
let INSIGHTS = [
    { "id": 1, "headline": "🚨 김포 골드라인 5호선 연장 확정 발표!", "summary": "...", "blog_link": "https://blog.naver.com/realkeeper/123456", "date": "2025-12-20" },
    { "id": 2, "headline": "📉 2026년 김포 부동산 하락론의 진실은?", "summary": "...", "blog_link": "https://blog.naver.com/realkeeper/789012", "date": "2025-12-22" },
    { "id": 3, "headline": "💡 [꿀팁] 권리분석사가 알려주는 '안전한 전세' 3법칙", "summary": "...", "blog_link": "https://blog.naver.com/realkeeper/345678", "date": "2025-12-23" }
];
let SCHEDULE_DATA = null;

const ROUTES = {
    "김포공항방면": ["양촌", "구래", "마산", "장기", "운양", "걸포북변", "사우(김포시청)", "풍무", "고촌", "김포공항"],
    "양촌역방면": ["김포공항", "고촌", "풍무", "사우(김포시청)", "걸포북변", "운양", "장기", "마산", "구래", "양촌"]
};

// =============================================================================
// [NEW] 7일 예보 활용 로직 (여기가 추가된 두뇌입니다 🧠)
// =============================================================================
function getFutureDate(targetDayName) {
    // "금" -> 다가오는 금요일의 YYYY-MM-DD 구하기
    const dayMap = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
    const today = new Date();
    const todayDay = today.getDay();
    let targetDay = dayMap[targetDayName.charAt(0)];

    if (targetDay === undefined) return today.toISOString().split('T')[0];

    let diff = targetDay - todayDay;
    if (diff < 0) diff += 7;

    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + diff);
    // 한국 시간 보정
    const kTime = new Date(futureDate.getTime() + (9 * 60 * 60 * 1000));
    return kTime.toISOString().split('T')[0];
}

function getWeatherForSelection(dayStr) {
    const targetDate = getFutureDate(dayStr);

    // MODEL_CONSTANTS.FORECAST(파일)에서 날씨 찾기
    let condition = "Clear";
    if (typeof MODEL_CONSTANTS !== 'undefined' && MODEL_CONSTANTS.FORECAST) {
        condition = MODEL_CONSTANTS.FORECAST[targetDate] || "Clear";
    }

    const map = {
        "Clear": { icon: "☀️", desc: "맑음", code: 0 },
        "Rain": { icon: "🌧️", desc: "비", code: 61 },
        "Snow": { icon: "☃️", desc: "눈", code: 71 }
    };
    return map[condition] || map["Clear"];
}

// =============================================================================
// [날씨] API (기존 로직 유지하되, 분석 시엔 위 함수 사용)
// =============================================================================
const WMO_CODES = { 0: '맑음 ☀️', 1: '대체로 맑음 🌤️', 2: '약간 흐림 ⛅', 3: '흐림 ☁️', 45: '안개 🌫️', 51: '이슬비 🌧️', 61: '비 ☔', 71: '눈 ☃️', 95: '천둥번개 ⚡' };

// [Weather] 7-Day Forecast & Air Quality
async function fetchRealWeather() {
    console.log("[날씨] 데이터 요청 중...");
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    set('kimpoDesc', '로딩..'); set('seoulDesc', '로딩..');

    try {
        const [resK, resS, resD] = await Promise.all([
            fetch("https://api.open-meteo.com/v1/forecast?latitude=37.615&longitude=126.715&current_weather=true&hourly=temperature_2m,weathercode&timezone=Asia%2FSeoul"),
            fetch("https://api.open-meteo.com/v1/forecast?latitude=37.550&longitude=126.849&current_weather=true&hourly=temperature_2m,weathercode&timezone=Asia%2FSeoul"),
            fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=37.615&longitude=126.715&current=pm10,pm2_5")
        ]);

        if (!resK.ok || !resS.ok) throw new Error("API Error");

        const dataK = await resK.json();
        const dataS = await resS.json();
        const dataD = resD.ok ? await resD.json() : null;

        const dustInfo = dataD ? dataD.current : null;

        // UI Update (Current + Dust)
        updateWeatherCard('kimpo', dataK.current_weather, dustInfo);
        updateWeatherCard('seoul', dataS.current_weather, dustInfo); // Use same dust for Seoul approx

        window.HOURLY_FORECAST = {
            times: dataK.hourly.time,
            temps: dataK.hourly.temperature_2m,
            codes: dataK.hourly.weathercode
        };

    } catch (e) {
        console.error("[날씨] 로드 실패:", e);
        set('kimpoDesc', '정보없음'); set('seoulDesc', '정보없음');
    }
}

function updateWeatherCard(prefix, data, dust) {
    const code = data.weathercode;
    const desc = WMO_CODES[code] || "정보없음";
    const icon = desc.split(' ').pop();
    const elTemp = document.getElementById(prefix + 'Temp');

    let label = desc;
    if (dust) {
        const pm10 = dust.pm10;
        let dustLv = '좋음';
        if (pm10 > 30) dustLv = '보통';
        if (pm10 > 80) dustLv = '나쁨';
        if (pm10 > 150) dustLv = '매우나쁨';
        label += ` / 미세먼지 ${dustLv}(${pm10})`;
    }

    if (elTemp) {
        elTemp.innerText = `${data.temperature}°C`;
        document.getElementById(prefix + 'Desc').innerText = label;
        document.getElementById(prefix + 'Icon').innerText = icon;
    }
}

// [Logic] Find Forecast for Target Day & Hour
function getSimulatedWeather(h, m) {
    if (!window.HOURLY_FORECAST) {
        return { temp: 0, icon: '❓', description: '기상청 연결실패' };
    }

    try {
        let targetDayStr = '오늘';
        const dayEl = document.getElementById('dayOfWeek');
        if (dayEl) targetDayStr = dayEl.value;

        const targetHour = parseInt(h);

        // Map Korean Day to 0(Sun)~6(Sat)
        const dayMap = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
        if (targetDayStr === '평일') targetDayStr = '월'; // Default to Mon
        if (targetDayStr === '주말') targetDayStr = '토'; // Default to Sat

        let targetDayIdx = dayMap[targetDayStr];
        if (targetDayIdx === undefined) {
            // Try to fuzzy match
            if (targetDayStr.includes('토') || targetDayStr.includes('일')) targetDayIdx = 6;
            else targetDayIdx = 1;
        }

        const times = window.HOURLY_FORECAST.times;
        const now = new Date();

        let foundIdx = -1;
        for (let i = 0; i < times.length; i++) {
            const tDate = new Date(times[i]);
            if (tDate.getDay() === targetDayIdx && tDate.getHours() === targetHour) {
                if (tDate >= now || (now - tDate) < 24 * 3600 * 1000) {
                    foundIdx = i;
                    break;
                }
            }
        }

        if (foundIdx !== -1) {
            const t = window.HOURLY_FORECAST.temps[foundIdx];
            const c = window.HOURLY_FORECAST.codes[foundIdx];
            const d = WMO_CODES[c] || "정보없음";
            return {
                temp: t,
                icon: d.split(' ').pop(),
                description: d
            };
        }
        return { temp: 0, icon: '❓', description: '예보범위 초과' };
    } catch (e) {
        return { temp: 0, icon: '❓', description: '예측오류' };
    }
}

function updateWeatherCard(prefix, data) {
    const code = data.weathercode;
    const desc = WMO_CODES[code] || "정보없음";
    const icon = desc.split(' ').pop();
    const elTemp = document.getElementById(prefix + 'Temp');
    if (elTemp) {
        elTemp.innerText = `${data.temperature}°C`;
        document.getElementById(prefix + 'Desc').innerText = desc;
        document.getElementById(prefix + 'Icon').innerText = icon;
    }
}

// =============================================================================
// [분석] analyze 함수 (7일 예보 적용)
// =============================================================================
async function analyze() {
    const btn = document.querySelector('.btn');
    const originalBtnText = btn.innerHTML;

    const day = document.getElementById('dayOfWeek').value;
    const dir = document.getElementById('direction').value;
    const st = document.getElementById('station').value;
    const h = parseInt(document.getElementById('hour').value);
    const m = parseInt(document.getElementById('minute').value);

    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> 분석중...';

    // 시간표 데이터 로드
    if (!SCHEDULE_DATA && SCHEDULE_URL && SCHEDULE_URL.startsWith('http')) {
        try { SCHEDULE_DATA = await fetchCSV(SCHEDULE_URL); } catch (e) { }
    }

    try {
        // [수정] API 호출 대신 로컬 계산 사용 (속도 향상 및 7일 예보 적용)
        await new Promise(r => setTimeout(r, 50)); // UI 반응용 딜레이

        // 1. Get Forecast
        let wInfo = null;
        if (typeof getSimulatedWeather === 'function') {
            wInfo = getSimulatedWeather(h, m);
        }

        // 2. Mock Data Wrapper
        const simData = {
            weather: wInfo,
            congestion: 0,
            routeSegments: []
        };

        // 3. ML 수요 예측 함수 주입 (updatePremiumUI 내부에서 사용됨)
        window.getRidership = (station, hour) => {
            if (typeof MODEL_CONSTANTS === 'undefined') return { board: 200, alight: 200 };

            const isHoliday = ['토', '일', '토요일', '일요일'].includes(day);
            const dayType = isHoliday ? 'Holiday' : 'Workday';

            // 예보 날씨 코드를 모델 타입으로 변환
            let wType = "Clear";
            if (wInfo && wInfo.description && wInfo.description.includes("비")) wType = "Rain";
            if (wInfo && wInfo.description && wInfo.description.includes("눈")) wType = "Snow";

            try {
                const base = MODEL_CONSTANTS.BASE_LOAD[station][dayType][hour] || { b: 200, a: 100 };
                const mFactor = MODEL_CONSTANTS.SEASON_FACTORS[new Date().getMonth() + 1] || 1.0;

                // [NEW] Time-based Weather Factor (Aus/Peak vs Off)
                // 출근(06:30~08:30) -> 6,7,8시 / 퇴근(17:30~19:30) -> 17,18,19시
                const isPeak = (hour >= 6 && hour <= 8) || (hour >= 17 && hour <= 19);
                const period = isPeak ? "Peak" : "Off";
                let wFactor = 1.0;

                if (MODEL_CONSTANTS.WEATHER_FACTORS[wType] && typeof MODEL_CONSTANTS.WEATHER_FACTORS[wType] === 'object') {
                    wFactor = MODEL_CONSTANTS.WEATHER_FACTORS[wType][period] || MODEL_CONSTANTS.WEATHER_FACTORS[wType] || 1.0;
                } else {
                    wFactor = MODEL_CONSTANTS.WEATHER_FACTORS[wType] || 1.0;
                }

                return {
                    board: Math.round(base.b * mFactor * wFactor),
                    alight: Math.round(base.a * mFactor * wFactor)
                };
            } catch (e) { return { board: 200, alight: 200 }; }
        };

        updatePremiumUI(st, dir, day, h, m, simData);

    } catch (err) {
        console.error(err);
        alert("분석 중 오류가 발생했습니다.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
        renderInsights();
    }
}

// =============================================================================
// [UI] updatePremiumUI (사용자 원본 디자인 100% 유지)
// =============================================================================
function updatePremiumUI(st, dir, day, h, m, data) {
    const resultDiv = document.getElementById('result');
    let html = '';

    const getTrainCount = (sName, targetH, targetDay) => {
        const useH = (targetH !== undefined) ? targetH : h;
        const useDay = (targetDay !== undefined) ? targetDay : day;
        if (typeof SCHEDULE_DATA === 'undefined') return (useH >= 7 && useH <= 9) ? 20 : 6;
        const searchDay = (useDay === '토' || useDay === '일') ? '토요일' : '평일';
        const row = SCHEDULE_DATA.find(r =>
            r['역이름'] === sName &&
            r['요일'].includes(searchDay) &&
            parseInt(r['시간']) === parseInt(useH) &&
            (r['방향'].includes(dir.split(' ')[0]) || dir.includes(r['방향'].split(' ')[0]))
        );
        if (!row || !row['분']) return (useH >= 7 && useH <= 9) ? 20 : 6;
        return row['분'].trim().split(/\s+/).length;
    };

    const CAPACITY = 172;
    const MAX_CAPACITY = 240;

    // Simulation Engine (ML Integrated)
    const calculateGoldlineCongestion = (targetH, direction, dayOfWeek) => {
        const stations = ROUTES[direction] || ROUTES["김포공항방면"];
        let finalLoads = {}, finalQueues = {}, stationQueues = {};
        stations.forEach(s => stationQueues[s] = 0);

        const isHoliday = ['토', '일', '토요일', '일요일'].includes(dayOfWeek);
        const dayType = isHoliday ? 'Holiday' : 'Workday';

        for (let simH = 5; simH <= targetH; simH++) {
            let currentOnboard = 0;
            // Direction Heuristic (User Request: 95% AM / 95% PM / 50% Off-peak)
            let baseDirRatio = 0.50; // Default 50:50

            if (dayType === 'Workday') {
                if (simH >= 5 && simH <= 9) baseDirRatio = 0.95; // AM Peak: 95% to Airport (Extended 05~09)
                else if (simH >= 17 && simH <= 21) baseDirRatio = 0.05; // PM Peak: 95% to Yangchon (Extended 17~21)
            }

            const isToAirportDirection = direction.includes("김포공항");
            const effectiveDirRatio = isToAirportDirection ? baseDirRatio : (1.0 - baseDirRatio);

            stations.forEach(st => {
                const rawRidership = (window.getRidership) ? window.getRidership(st, simH) : { board: 200, alight: 200 };
                let newBoardingDemand = rawRidership.board * effectiveDirRatio * 1.25;
                let totalBoardingDemand = newBoardingDemand + stationQueues[st];

                let alightingPassengers = Math.min(rawRidership.alight * effectiveDirRatio, currentOnboard);
                let remainingOnboard = currentOnboard - alightingPassengers;

                let trainCount = getTrainCount(st, simH, dayOfWeek);
                if (!trainCount || trainCount < 1) trainCount = (simH >= 7 && simH <= 9) ? 21 : 6;
                trainCount = parseInt(trainCount);

                const hourlySupply = trainCount * MAX_CAPACITY;
                const availableCapacity = hourlySupply - remainingOnboard;
                let actualBoarding = Math.min(totalBoardingDemand, Math.max(0, availableCapacity));

                stationQueues[st] = totalBoardingDemand - actualBoarding;
                currentOnboard = remainingOnboard + actualBoarding;

                if (simH === parseInt(targetH)) {
                    finalLoads[st] = currentOnboard;
                    finalQueues[st] = stationQueues[st];
                }
            });
        }
        return { loads: finalLoads, queues: finalQueues };
    };

    const getBoardingMessage = (qCount) => {
        const TRAIN_CAPACITY = 240;
        const MIN_HEADWAY = 3;
        const MAX_HEADWAY = 4;
        if (!qCount || qCount <= 0) {
            return `<div style="margin-top:15px; padding:12px; background:rgba(0,230,118,0.1); border-left:4px solid #00E676; border-radius:4px;">
                <div style="font-weight:800; color:#00E676; font-size:14px; margin-bottom:4px;">🟢 바로 탑승 가능</div>
                <div style="font-size:12px; color:#E0F7FA;">지금 개찰구를 통과하면 바로 탈 수 있어요!</div>
             </div>`;
        }
        const waitTrains = Math.ceil(qCount / TRAIN_CAPACITY);
        const minW = waitTrains * MIN_HEADWAY;
        const maxW = waitTrains * MAX_HEADWAY;
        return `<div style="margin-top:15px; padding:12px; background:rgba(255,82,82,0.1); border-left:4px solid #FF5252; border-radius:4px;">
            <div style="font-weight:800; color:#FF5252; font-size:14px; margin-bottom:4px;">🔴 탑승 불가 (약 ${minW}~${maxW}분 대기)</div>
            <div style="font-size:12px; color:#FFEBEE;">현재 승강장이 매우 붐벼, 열차를 <strong>${waitTrains}대</strong> 보내야 탑승할 수 있습니다.</div>
        </div>`;
    };

    // 1. 이번/다음 열차 (User's Original Logic)
    const findRowMinutes = (targetH) => {
        if (typeof SCHEDULE_DATA === 'undefined') return [];
        const searchDay = (day === '토' || day === '일') ? '토요일' : '평일';
        const row = SCHEDULE_DATA.find(r => {
            if (r['역이름'] !== st) return false;
            if (!r['요일'].includes(searchDay)) return false;
            if (parseInt(r['시간']) !== parseInt(targetH)) return false;

            // [Fix] Direction Matching Logic
            // "양촌역방면" 선택 시 -> "양촌행" & "구래행" 모두 포함해야 함
            if (dir.includes("김포공항")) {
                return r['방향'].includes("김포공항");
            } else {
                return r['방향'].includes("양촌") || r['방향'].includes("구래");
            }
        });
        if (!row || !row['분']) return [];
        return row['분'].trim().split(/\s+/).map(v => {
            const numStr = v.replace(/[^0-9]/g, '');
            const val = parseInt(numStr);
            const isYangchon = v.includes('(') || v.includes('양') || v.includes('-');
            return isNaN(val) ? null : { m: val, y: isYangchon };
        }).filter(x => x).sort((a, b) => a.m - b.m);
    };

    const currentMinsObjs = findRowMinutes(h);
    const nextHourMinsObjs = findRowMinutes(parseInt(h) + 1);
    let candidates = [];
    currentMinsObjs.forEach(item => { if (item.m >= m) candidates.push({ h: h, ...item }); });
    nextHourMinsObjs.forEach(item => { candidates.push({ h: parseInt(h) + 1, ...item }); });

    const fmtT = (obj) => obj ? `${String(obj.h).padStart(2, '0')}:${String(obj.m).padStart(2, '0')}` : "운행종료";
    const next1Text = fmtT(candidates[0]);
    const next2Text = fmtT(candidates[1]);

    html += '<div class="train-card current"><div class="train-header">';
    html += `<div style="display:flex; justify-content:space-between; width:100%; margin-bottom:8px;"><span class="train-label current">🚇 이번 열차</span><span class="train-time origin">${next1Text}</span></div>`;
    html += `<div style="display:flex; justify-content:space-between; width:100%;"><span class="train-label">🚇 다음 열차</span><span class="train-time">${next2Text}</span></div></div>`;

    // 2. 시간표 Grid (User's Original Design)
    html += `<div class="timetable-compact" style="background:rgba(125,249,255,0.05); padding:15px; border-radius:10px; margin-top:10px;">`;
    html += `<div class="timetable-title">🕐 ${h}시대 열차 시간표</div><div class="time-grid">`;
    currentMinsObjs.forEach(item => {
        const min = item.m;
        const isSpecial = (st === '장기' && h === 5 && min === 26);
        let style = isSpecial ? 'background:#FFD700; color:#1B2838; font-weight:bold; border:1px solid #FFF;' : '';
        let label = `${h}:${String(min).padStart(2, '0')}`;
        if (item.y) {
            label += `<span style="font-size:9px; vertical-align:top; color:#FF5722; margin-left:1px;">(양)</span>`;
            if (!isSpecial) style += 'border:1px solid rgba(255,87,34,0.5);';
        }
        html += `<div class="time-chip" style="${style}">${label}</div>`;
    });

    if (st === '장기' && dir.includes('김포공항') && h === 5 && currentMinsObjs.some(t => t.m === 26)) {
        html += `<div style="background:linear-gradient(90deg, #FFD700, #FFA000); padding:12px; border-radius:8px; margin-top:12px; box-shadow:0 2px 8px rgba(255, 215, 0, 0.2); animation: pulse 2s infinite;">
                <div style="color:#1B2838; font-weight:800; font-size:14px; margin-bottom:2px;">🍯 꿀팁: 5:26분 출발 열차!</div>
                <div style="color:#1B2838; font-size:12px; font-weight:600;">장기역 시발 열차(텅 빈 차)가 옵니다. 100% 앉아서 가실 수 있습니다.</div></div>`;
    }

    // 버스 정보 (User's Original Logic)
    let isCrowded = false;
    if (data.routeSegments && data.routeSegments.length > 0) {
        const maxCong = Math.max(...data.routeSegments.map(s => s.congestion));
        if (maxCong >= 150) isCrowded = true;
    } else if (data.congestion >= 150) isCrowded = true;

    const busInfo = (typeof BUS_DATA !== 'undefined') ? BUS_DATA[st] : null;
    if (isCrowded && busInfo && busInfo.targetRoutes) {
        html += `<div class="train-card" style="margin-top:12px; border:1px solid rgba(255, 152, 0, 0.5); background:rgba(255, 152, 0, 0.05);">
            <div style="display:flex; align-items:flex-start; margin-bottom:10px;">
                <span style="font-size:20px; margin-right:8px; margin-top:-2px;">📡</span>
                <div><div style="font-weight:800; color:#FF9800; font-size:15px;">🚌 실시간 대체 버스 (Live)</div>
                <div style="font-size:11px; color:#B0BEC5; line-height:1.4; margin-top:4px;">⚠️ <strong>주의:</strong> 아래 버튼은 현재 시각 기준의 실시간 위치입니다.</div></div></div>`;
        busInfo.targetRoutes.forEach(r => {
            const query = `${busInfo.stationName} ${r.name}번 버스`;
            const url = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(query)}`;
            html += `<a href="${url}" target="_blank" style="display:flex; justify-content:space-between; align-items:center; background:#FFF; padding:12px 14px; border-radius:8px; margin-top:8px; text-decoration:none; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="background:#00C853; color:white; font-size:12px; font-weight:900; padding:3px 8px; border-radius:4px;">${r.name}</span>
                    <span style="font-size:13px; color:#333; font-weight:700;">${r.dest} 방면</span>
                </div>
                <div style="display:flex; align-items:center;"><span style="font-size:12px; color:#1976D2; font-weight:800;">실시간 위치/빈자리 확인 🔗</span></div></a>`;
        });
        html += `</div>`;
    }
    html += '</div></div>';

    // 3. 날씨 (Forecast applied)
    const weather = data.weather || getSimulatedWeather(h, m);
    html += `<div class="weather-section" style="margin-top:10px; padding:10px; border-radius:10px; background:rgba(125,249,255,0.05);">`;
    html += `<div style="color:#7DF9FF; font-weight:700; margin-bottom:5px;">🌤️ 예측 날씨</div>`;
    html += `<div style="font-size:24px;">${weather.icon} ${weather.temp}°C · ${weather.description}</div>`; // 온도는 단순 표시, 상태가 중요
    html += `<div style="font-size:12px; color:#FFD700; margin-top:4px;">📍 ${st} (${day}요일 ${h}시 ${m}분 기준) 예측</div>`;
    html += `</div></div>`;

    // 4. 구간 혼잡도
    let routeList = ROUTES[dir] || ROUTES["김포공항방면"];
    let startIdx = routeList.indexOf(st); if (startIdx === -1) startIdx = 0;

    html += '<div class="train-card"><div style="display:flex; justify-content:center; align-items:center; color:#7DF9FF; font-weight:700; margin-bottom:15px;">📊 구간별 평균혼잡도<span class="info-icon" onclick="openTooltip()" style="margin-left:8px; cursor:pointer;" title="설명 보기">?</span></div>';

    // Use the ML engine (calculateGoldlineCongestion)
    const { loads: loadMap, queues: queueMap } = calculateGoldlineCongestion(h, dir, day);

    html += '<div class="journey-map-wrapper"><div class="journey-map">';
    for (let i = startIdx; i < routeList.length - 1; i++) {
        const tCount = getTrainCount(routeList[i], h, day);
        const currentSectionLoad = loadMap[routeList[i]] || 0;
        const calculatedCongestion = (currentSectionLoad / tCount / CAPACITY) * 100;
        let cong = Math.max(10, Math.min(280, calculatedCongestion));
        let lvItem = getCongestionLevel(cong);

        if (i === startIdx) html += `<div class="map-station current">${routeList[i]}</div>`;
        html += `<div class="map-segment level-${lvItem.c}" onmousedown="showCongestionPopup('${lvItem.i}', '${lvItem.n}', '${lvItem.d}', event)" ontouchstart="showCongestionPopup('${lvItem.i}', '${lvItem.n}', '${lvItem.d}', event)" style="cursor:pointer; user-select:none;">
                <span class="map-icon">${lvItem.i}</span><span class="map-text">${Math.round(cong)}%</span></div>
            <div class="map-station">${routeList[i + 1]}</div>`;
    }
    html += '</div></div>';

    const myQueue = queueMap[st] || 0;
    if (myQueue > 1500) {
        html += `<div class="boarding-message alert" style="background:rgba(255,82,82,0.15); border:1px solid #FF5252; padding:15px; border-radius:8px; margin-top:15px; animation: pulse 2s infinite;">
            <div style="color:#FF5252; font-weight:800; font-size:16px; margin-bottom:4px;">⛔ 진입 통제 중</div>
            <div style="color:#FFCDD2; font-size:13px;">대기 인원 과다(${Math.round(myQueue)}명)로 역사 진입이 통제되고 있습니다.</div>
            <div style="color:#FFF; font-weight:bold; font-size:14px; margin-top:8px;">예상 대기시간: 40분 이상 🚨</div></div>`;
    } else {
        html += getBoardingMessage(myQueue);
    }
    html += '</div>';

    // 5. 상세 테이블
    const trainCountLabel = (currentMinsObjs && currentMinsObjs.length > 0) ? `${currentMinsObjs.length}대` : "-";
    html += '<div class="train-card">';
    html += `<div style="font-size:14px; font-weight:700; color:#7DF9FF; margin-bottom:10px;">📈 구간별 상세 데이터 (시간대: ${h}시)</div>`;
    html += `<table class="detail-table" style="width:100%; border-collapse:collapse;"><thead><tr style="background:rgba(125,249,255,0.1);"><th style="padding:8px; color:#7DF9FF; font-size:11px;">구간</th><th style="padding:8px; color:#7DF9FF; font-size:11px;">혼잡도</th><th style="padding:8px; color:#7DF9FF; font-size:11px;">탑승객</th><th style="padding:8px; color:#7DF9FF; font-size:11px;">배차</th></tr></thead><tbody>`;

    for (let i = 0; i < routeList.length - 1; i++) {
        const curr = routeList[i];
        const next = routeList[i + 1];
        const tCount = getTrainCount(curr, h, day);
        const currentSectionLoad = loadMap[curr] || 0;
        const calculatedCongestion = (currentSectionLoad / tCount / CAPACITY) * 100;
        let cong = calculatedCongestion + (Math.random() * 5 - 2.5);
        const lv = getCongestionLevel(cong);
        const personsPerTrain = Math.round(currentSectionLoad / tCount);
        const trains = tCount + "대";
        const isCurrent = (curr === st);
        const bgStyle = isCurrent ? 'background:rgba(255,215,0,0.1);' : 'border-bottom:1px solid rgba(255,255,255,0.05);';

        html += `<tr style="${bgStyle}">
                    <td style="padding:6px 8px; font-size:11px; color:#F0F4F8;">${curr} → ${next}</td>
                    <td style="padding:6px 8px; text-align:center;">
                        <span style="color:${lv.c >= 7 ? '#FF5722' : '#7DF9FF'}; font-weight:700; font-size:12px;">${Math.round(cong)}%</span>
                        <span style="font-size:10px; color:#999; margin-left:2px;">(${lv.n})</span>
                    </td>
                    <td style="padding:6px 8px; text-align:center; font-size:11px; color:#DDD;">${personsPerTrain}명</td>
                    <td style="padding:6px 8px; text-align:center; font-size:11px; color:#DDD;">${trains}</td>
                </tr>`;
    }
    html += `</tbody></table></div>`;

    // 6. 범례
    html += '<div class="train-card">';
    html += '<div style="font-size:14px; font-weight:700; color:#7DF9FF; margin-bottom:12px; display:flex; align-items:center;">📊 10단계 혼잡도 체감 설명</div>';
    html += '<div style="display:flex; flex-direction:column; gap:6px;">';
    LEVELS.forEach(l => {
        html += `<div style="display:flex; align-items:center; background:rgba(255,255,255,0.03); padding:6px; border-radius:6px;">
                <div class="legend-icon level-${l.c}" style="width:28px; height:28px; display:flex; justify-content:center; align-items:center; font-size:16px; border-radius:5px; margin-right:10px;">${l.i}</div>
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; margin-bottom:0px;">
                        <span style="color:#FFF; font-weight:700; width:70px; font-size:13px;">[${l.t >= 999 ? 'MAX' : l.t + '%↓'}]</span>
                        <span style="color:#7DF9FF; font-weight:700; font-size:13px;">${l.n}</span>
                    </div>
                    <div style="font-size:11px; color:#B0BEC5;">${l.d}</div>
                </div></div>`;
    });
    html += '</div></div>';

    resultDiv.innerHTML = html;
    resultDiv.classList.add('show');
}

// [공통 유틸] 인사이트, CSV 파싱, 툴팁
async function renderInsights() {
    const insightSection = document.getElementById('insight-section');
    if (!insightSection) return;
    const draw = (data) => {
        let html = `<div class="train-card"><div style="color:#FFD700; font-weight:700; margin-bottom:15px; font-size:15px;">🏆 REAL KEEPER 부동산 인사이트</div><div style="display:flex; flex-direction:column; gap:12px;">`;
        data.forEach(item => {
            html += `<div class="insight-item" style="background:rgba(255,255,255,0.03); padding:12px; border-radius:10px; border:1px solid rgba(125,249,255,0.1);">
                    <div style="font-size:13px; color:#7DF9FF; font-weight:700; margin-bottom:5px;">${item.headline}</div>
                    <div style="font-size:11px; color:#B0BEC5; line-height:1.4; margin-bottom:8px;">${item.summary}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:10px; color:#666;">${item.date}</span>
                        <a href="${item.blog_link || item.link || item.url || '#'}" target="_blank" style="font-size:11px; color:#FFD700; text-decoration:none;">자세히 보기 →</a>
                    </div></div>`;
        });
        html += `</div></div>`;
        insightSection.innerHTML = html;
        insightSection.classList.add('show');
    };
    draw(INSIGHTS);
    if (EXCEL_URL && EXCEL_URL.startsWith('http')) {
        try { const remoteData = await fetchCSV(EXCEL_URL); if (remoteData && remoteData.length > 0) draw(remoteData); } catch (e) { }
    }
}

async function fetchCSV(url, rawContent = null) {
    try {
        let csvText = rawContent;
        if (!csvText) { const resp = await fetch(url); if (!resp.ok) throw new Error(`HTTP ${resp.status}`); csvText = await resp.text(); }
        const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        if (lines.length < 1) return [];
        const parseLine = (text) => {
            const res = []; let cur = ''; let inQuote = false;
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (inQuote) { if (c === '"') { if (i + 1 < text.length && text[i + 1] === '"') { cur += '"'; i++; } else inQuote = false; } else cur += c; }
                else { if (c === '"') inQuote = true; else if (c === ',') { res.push(cur.trim()); cur = ''; } else cur += c; }
            }
            res.push(cur.trim()); return res;
        };
        const headers = parseLine(lines[0]); const result = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue; const currentline = parseLine(lines[i]);
            let obj = {}; headers.forEach((h, idx) => { if (currentline[idx] !== undefined) obj[h] = currentline[idx]; });
            result.push(obj);
        }
        return result;
    } catch (e) { return null; }
}

const LEVELS = [
    { t: 32, n: '극락', i: '😌', c: 1, d: '좌석이 넉넉합니다. 원하는 자리에 골라 앉아 편안히 쉴 수 있습니다.' },
    { t: 50, n: '쾌적', i: '🙂', c: 2, d: '모든 좌석이 차고 약 30명 정도가 서 있습니다.' },
    { t: 75, n: '보통', i: '😐', c: 3, d: '입석 승객이 늘어나 대부분의 손잡이가 찼습니다.' },
    { t: 100, n: '밀집', i: '😑', c: 4, d: '정원이 모두 찼습니다. 빈 공간이 없으며 여유가 없습니다.' },
    { t: 125, n: '불쾌', i: '😒', c: 5, d: '승객들의 몸이 맞닿기 시작합니다. 팔을 움직이기 불편합니다.' },
    { t: 150, n: '압박', i: '😖', c: 6, d: '지옥철 수준입니다. 스마트폰을 보기 힘들며 몸이 고정됩니다.' },
    { t: 175, n: '고통', i: '😫', c: 7, d: '사방에서 강한 압력을 받아 몸을 가누기 어렵습니다.' },
    { t: 200, n: '위험', i: '🥵', c: 8, d: '공기가 부족하고 답답합니다. 실신 위험이 있는 상태입니다.' },
    { t: 225, n: '공포', i: '😵', c: 9, d: '움직임이 불가능하며 극심한 공포와 압사 위험을 느낍니다.' },
    { t: 9999, n: '재난', i: '😱', c: 10, d: '물리적 한계를 초과한 재난 상황입니다. 즉각적인 통제가 필요합니다.' }
];
function getCongestionLevel(pct) { return LEVELS.find(l => pct <= l.t) || LEVELS[LEVELS.length - 1]; }
function openTooltip() { document.getElementById('tooltipOverlay').style.display = 'block'; document.getElementById('tooltipPopup').style.display = 'block'; document.getElementById('tooltipPopup').classList.add('show'); }
function closeTooltip() { document.getElementById('tooltipOverlay').style.display = 'none'; document.getElementById('tooltipPopup').style.display = 'none'; document.getElementById('tooltipPopup').classList.remove('show'); }
// [Fix] Global Popup Management
function showCongestionPopup(icon, name, desc, event) {
    // if (event) event.preventDefault(); // Removed to prevent scrolling issues
    const old = document.getElementById('tempPopup'); if (old) old.remove();
    const popupHtml = `<div id="tempPopup" style="position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1B2838; border:2px solid #7DF9FF; border-radius:15px; padding:25px; width:85%; max-width:320px; text-align:center; box-shadow:0 0 30px rgba(0,0,0,0.8); z-index:9999; animation:popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events:none;"><div style="font-size:64px; margin-bottom:10px;">${icon}</div><div style="font-size:28px; font-weight:900; color:#7DF9FF; margin-bottom:10px;">${name}</div><div style="font-size:15px; color:#F0F4F8; line-height:1.5; margin-bottom:15px;">${desc}</div><div style="font-size:11px; color:#B0BEC5; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">손을 떼면 닫힙니다</div></div><style>@keyframes popIn { from{transform:translate(-50%,-50%) scale(0.8); opacity:0;} to{transform:translate(-50%,-50%) scale(1); opacity:1;} }</style>`;
    document.body.insertAdjacentHTML('beforeend', popupHtml);

    // Add global listener to close on release anywhere
    window.addEventListener('mouseup', hideCongestionPopup, { once: true });
    window.addEventListener('touchend', hideCongestionPopup, { once: true });
}
function hideCongestionPopup() {
    const popup = document.getElementById('tempPopup');
    if (popup) popup.remove();
}

async function init() {
    const hourSelect = document.getElementById('hour'); const minuteSelect = document.getElementById('minute'); const stSelect = document.getElementById('station');
    if (hourSelect) { hourSelect.innerHTML = ''; for (let i = 5; i <= 23; i++) { let opt = document.createElement('option'); opt.value = i; opt.text = i + '시'; hourSelect.add(opt); } hourSelect.value = 8; }
    if (minuteSelect) { minuteSelect.innerHTML = ''; for (let i = 0; i < 60; i++) { let opt = document.createElement('option'); opt.value = i; opt.text = i + '분'; minuteSelect.add(opt); } }
    if (stSelect) { stSelect.innerHTML = '';["양촌", "구래", "마산", "장기", "운양", "걸포북변", "사우(김포시청)", "풍무", "고촌", "김포공항"].forEach(s => { let opt = document.createElement('option'); opt.value = s; opt.text = s; stSelect.add(opt); }); }
    const updateSt = () => { const dir = document.getElementById('direction').value; stSelect.innerHTML = ''; (ROUTES[dir] || ROUTES["김포공항방면"]).forEach(s => stSelect.add(new Option(s, s))); };
    document.getElementById('direction').addEventListener('change', updateSt); updateSt();

    renderInsights();
    fetchRealWeather();

    let loadedData = null;
    if (typeof window.MANUAL_SCHEDULE_DATA !== 'undefined' && Array.isArray(window.MANUAL_SCHEDULE_DATA) && window.MANUAL_SCHEDULE_DATA.length > 0) {
        loadedData = window.MANUAL_SCHEDULE_DATA; window.SCHEDULE_DATA = loadedData; SCHEDULE_DATA = loadedData;
    }
    if (!loadedData && typeof SCHEDULE_URL !== 'undefined' && SCHEDULE_URL && SCHEDULE_URL.startsWith('http')) {
        try { const data = await fetchCSV(SCHEDULE_URL); if (data && data.length > 0) { window.SCHEDULE_DATA = data; } } catch (e) { }
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();