// ============================================================================
// 김포 골드라인 혼잡도 예측 API (V4.1 - Emergency Unlocked)
// ============================================================================

// Global Cache prevents re-fetching/parsing on every request (Hot Start)
let cachedDb = null;

// HARDCODED FALLBACK DRIVER (Minimal viable data pattern)
// Used when both Local and GitHub sources fail/timeout
const FALLBACK_DB = {
    EMERGENCY_MODE: true,
    // We don't populate full data here, but use a flag to trigger heuristic logic
};

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);

    // 1. CORS Headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const params = url.searchParams;

        // 2. Validate Inputs
        const station = params.get("station");
        const dateVal = params.get("day");
        const timeVal = parseInt(params.get("hour"));
        const direction = params.get("direction");

        if (!station || !dateVal || isNaN(timeVal)) {
            return new Response(JSON.stringify({ success: false, error: "Missing parameters" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // 3. Load Secure Data
        // STRATEGY: Global Cache -> Local -> GitHub (Timeout 3.5s) -> Hardcoded Fallback
        let db = cachedDb;

        if (!db) {
            const dataUrlLocal = `${url.origin}/data.json`;
            const dataUrlGithub = "https://raw.githubusercontent.com/ns0408/gimpo-goldline/main/data.json";

            // Helper for timeout
            const fetchWithTimeout = (url, ms) => {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), ms);
                return fetch(url, { signal: controller.signal }).then(r => {
                    clearTimeout(id);
                    return r;
                }).catch(err => {
                    clearTimeout(id);
                    throw err;
                });
            };

            try {
                // Try Local First (Fastest if it works)
                // Use 1500ms timeout for local
                const localResp = await fetchWithTimeout(dataUrlLocal, 1500);
                if (localResp.ok) {
                    db = await localResp.json();
                } else {
                    throw new Error("Local load failed");
                }
            } catch (localErr) {
                // console.warn("Local failed, trying GitHub...", localErr);
                try {
                    // Try GitHub with strict timeout (3500ms)
                    const ghResp = await fetchWithTimeout(dataUrlGithub, 3500);
                    if (ghResp.ok) {
                        db = await ghResp.json();
                    } else {
                        throw new Error("GitHub load failed");
                    }
                } catch (ghErr) {
                    // console.error("Critical: All network DB loads failed. Switching to EMERGENCY DRIVER.");
                    db = FALLBACK_DB;
                }
            }
            // Save to Cache
            cachedDb = db;
        }

        // 4. CORE LOGIC
        // If EMERGENCY_MODE is true, we calculate heuristic congestion
        let finalCong = 0;
        let count = 0;
        let similarDays = [];
        let mlVal = null;
        let routeSegments = [];

        if (db.EMERGENCY_MODE) {
            // --- EMERGENCY HEURISTIC ---
            // Peak: 7-9am (250%), 18-20pm (200%)
            if (timeVal >= 7 && timeVal <= 9) finalCong = 240 + Math.random() * 20;
            else if (timeVal >= 17 && timeVal <= 19) finalCong = 200 + Math.random() * 20;
            else if (timeVal >= 10 && timeVal <= 16) finalCong = 50 + Math.random() * 20;
            else finalCong = 10;

            finalCong = Math.round(finalCong);

            // Adjust for station position (Sequence: Yangchon -> Gimpo Airport)
            const stations = ["양촌", "구래", "마산", "장기", "운양", "걸포북변", "사우", "풍무", "고촌", "김포공항"];
            const stIdx = stations.indexOf(station.replace('역', ''));
            // Traffic accumulates towards airport
            if (stIdx > -1) {
                const factor = (stIdx + 1) / stations.length;
                finalCong = Math.round(finalCong * factor * 1.2);
            }

            // Generate Fake Route Segment for Vis
            routeSegments = stations.map(s => ({
                station: s,
                pct: Math.min(280, Math.round(finalCong * (stations.indexOf(s) + 1) / 10)),
                emoji: "🟡" // Generic
            }));

        } else {
            // --- NORMAL DB LOGIC ---
            const targetDate = new Date(dateVal);
            const targetDow = targetDate.getDay();
            const isTargetWeekend = (targetDow === 0 || targetDow === 6);
            const targetMonth = targetDate.getMonth();
            const targetWeather = params.get("weather") || "Clear";
            const isTargetHoliday = params.get("holiday") === "true" || isTargetWeekend;

            const historyKeys = Object.keys(db);

            historyKeys.forEach(k => {
                const dayData = db[k];
                if (!dayData || !dayData.meta) return;
                let score = 0;

                const dataDow = (targetDow + 6) % 7;
                if (dayData.meta.dow === dataDow) score += 50;

                const dbIsHoliday = dayData.meta.holiday || dayData.meta.weekend;
                if (dbIsHoliday === isTargetHoliday) score += 30;

                if (dayData.meta.weather === targetWeather) score += 20;

                const hMonth = new Date(k).getMonth();
                if (hMonth === targetMonth) score += 10;
                else if (Math.abs(hMonth - targetMonth) <= 1) score += 5;

                similarDays.push({ date: k, score: score, data: dayData });
            });

            similarDays.sort((a, b) => b.score - a.score);
            const top5 = similarDays.slice(0, 5);

            let totalCong = 0;
            // Calculate station specific congestion
            top5.forEach(item => {
                if (item.data.hourly && item.data.hourly[String(timeVal)]) {
                    const hourlyData = item.data.hourly[String(timeVal)];
                    const stData = hourlyData.find(s =>
                        s.station === station || s.station === station.replace('역', '') || station.startsWith(s.station)
                    );

                    if (stData) {
                        if (stData.cong <= 400) { // Outlier filter
                            totalCong += stData.cong;
                            count++;
                        }
                    }
                }
            });

            // Route visualization
            if (top5.length > 0 && top5[0].data.hourly && top5[0].data.hourly[String(timeVal)]) {
                const bestHourParams = top5[0].data.hourly[String(timeVal)];
                if (bestHourParams) {
                    routeSegments = bestHourParams.map(s => ({
                        station: s.station,
                        pct: s.cong > 400 ? 0 : s.cong,
                        emoji: s.cong > 80 ? "🔴" : (s.cong > 30 ? "🟡" : "🟢")
                    }));
                }
            }

            const avgCong = count > 0 ? Math.round(totalCong / count) : 0;
            finalCong = avgCong;

            // Ensemble ML
            if (db[dateVal] && db[dateVal].ml_pred && db[dateVal].ml_pred[String(timeVal)]) {
                const mlHourData = db[dateVal].ml_pred[String(timeVal)];
                const cleanStation = station.replace('역', '');
                const matchedKey = Object.keys(mlHourData).find(k => k === cleanStation || cleanStation.startsWith(k));
                if (matchedKey) {
                    mlVal = mlHourData[matchedKey];
                }
            }

            if (mlVal !== null) {
                finalCong = Math.round((mlVal * 0.6) + (avgCong * 0.4));
            }
        }

        // =========================================================================
        // 7. HONEY TIP ENGINE (Real-Time + Deep Link)
        // =========================================================================
        let tipData = null;

        const BUS_STATION_MAP = {
            "풍무": { id: "233001456", routes: { "233000031": "70번", "233000003": "88번", "100100612": "서울02(출근)" }, name: "풍무역.트레이더스" },
            "고촌": { id: "233000138", routes: { "233000031": "70번", "233000003": "88번", "100100612": "서울02(출근)" }, name: "고촌역" },
            "사우": { id: "233000141", routes: { "233000031": "70번", "233000003": "88번", "100100612": "서울02(출근)" }, name: "사우역.김포고" },
        };

        const EXTREME_CONGESTION = 150;
        const HIGH_CONGESTION = 130;
        const BUS_API_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3";

        if (finalCong >= EXTREME_CONGESTION) {
            const stKey = Object.keys(BUS_STATION_MAP).find(k => station.includes(k));
            const busInfo = stKey ? BUS_STATION_MAP[stKey] : null;

            let realTimeArrivals = [];

            if (busInfo) {
                try {
                    const apiUrl = `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey=${BUS_API_KEY}&stationId=${busInfo.id}`;
                    // Use standard fetch for external API (Cloudflare workers usually handle external fetch fine)
                    const busResp = await fetch(apiUrl);
                    if (busResp.ok) {
                        const xmlText = await busResp.text();
                        const listMatches = xmlText.match(/<busArrivalList>([\s\S]*?)<\/busArrivalList>/g);
                        if (listMatches) {
                            listMatches.forEach(block => {
                                const rId = block.match(/<routeId>(.*?)<\/routeId>/)?.[1];
                                const pTime1 = block.match(/<predictTime1>(.*?)<\/predictTime1>/)?.[1];
                                const pTime2 = block.match(/<predictTime2>(.*?)<\/predictTime2>/)?.[1];
                                if (rId && busInfo.routes[rId] && pTime1) {
                                    realTimeArrivals.push({
                                        busName: busInfo.routes[rId],
                                        time1: pTime1,
                                        time2: pTime2 || null
                                    });
                                }
                            });
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }

            if (realTimeArrivals.length > 0) {
                tipData = {
                    type: "REAL_TIME",
                    msg: `🚍 70번 버스 도착 예정 정보 (${stKey}역 정류장)`,
                    arrivals: realTimeArrivals
                };
            } else {
                const fallbackId = busInfo ? busInfo.id : "233001456";
                const fallbackRoute = "233000031";
                const deepLinkUrl = `http://m.gbis.go.kr/search/StationArrivalVia.do?stationId=${fallbackId}&routeId=${fallbackRoute}`;
                tipData = {
                    type: "DEEP_LINK",
                    msg: "🚍 현재 '극한 혼잡' 상태입니다! 70번 버스(당산행) 실시간 위치 확인하기",
                    url: deepLinkUrl,
                    btnText: "70번 버스 위치 확인"
                };
            }

        } else if (finalCong >= HIGH_CONGESTION) {
            tipData = {
                type: "TIME_SHIFT",
                msg: `💡 1시간 전/후 이용 시 혼잡도가 낮아질 수 있습니다.`
            };
        }

        // 8. FINAL RESPONSE
        const result = {
            success: true,
            data: {
                congestion: finalCong,
                message: db.EMERGENCY_MODE ? "Emergency Mode Active" : "Ensemble Prediction Success",
                context: {
                    matchCount: count,
                    topMatchDate: similarDays[0]?.date || "None",
                    score: similarDays[0]?.score || 0,
                    ml_pred: mlVal,
                    knn_pred: finalCong,
                    source: db.EMERGENCY_MODE ? "EMERGENCY_FALLBACK" : "LIVE_DB"
                },
                tip: tipData,
                trains: [
                    {
                        time: { hour: timeVal, minute: 0 },
                        congestion: {
                            pct: finalCong,
                            text: finalCong >= 130 ? "혼잡" : (finalCong >= 80 ? "보통" : "여유"),
                            emoji: finalCong >= 130 ? "😱" : (finalCong >= 80 ? "😐" : "😊")
                        },
                        route: routeSegments
                    }
                ]
            }
        };

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: "System Crash: " + err.message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
}