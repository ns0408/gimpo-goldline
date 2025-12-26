import os
import glob
import pandas as pd
import json
import re
from datetime import datetime
import urllib.request
import urllib.error

# ==============================================================================
# 1. 설정 (Configuration)
# ==============================================================================
RAW_DATA_DIR = os.path.join(os.getcwd(), "raw_data")
OUTPUT_FILE = os.path.join(os.getcwd(), "assets", "model_constants.js")
# 로컬 테스트용 경로 (필요 시 수정)
OUTPUT_FILE_DESKTOP = r"C:\Users\박남순\OneDrive\Desktop\gimpo-goldline\assets\model_constants.js"

LAT = 37.615
LON = 126.715

# [필수] 공휴일 데이터
HOLIDAYS = set([
    "2024-01-01", "2024-02-09", "2024-02-10", "2024-02-11", "2024-02-12",
    "2024-03-01", "2024-04-10",
    "2024-05-05", "2024-05-06", "2024-05-15",
    "2024-06-06", "2024-08-15", "2024-09-16", "2024-09-17", "2024-09-18",
    "2024-10-03", "2024-10-09", "2024-12-25",
    "2025-01-01", "2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30"
])

def get_holiday_status(date_str):
    if date_str in HOLIDAYS: return 'Holiday'
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        if dt.weekday() >= 5: return 'Holiday'
    except: pass
    return 'Workday'

# WMO 코드 변환 (단순화)
def convert_wmo(code):
    if code is None: return "Clear"
    if 71 <= code <= 77 or 85 <= code <= 86: return "Snow"
    if code >= 51: return "Rain"
    return "Clear"

# ==============================================================================
# 2. 날씨 수집 함수 (과거 + 미래 7일)
# ==============================================================================
def fetch_historical_weather(start_date, end_date):
    """과거 날씨 (학습용)"""
    print(f"🌦️ [과거] 날씨 데이터 다운로드 ({start_date} ~ {end_date})")
    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={LAT}&longitude={LON}&start_date={start_date}&end_date={end_date}&daily=weather_code&timezone=Asia%2FSeoul"
    try:
        with urllib.request.urlopen(url) as response:
            if response.status != 200: raise Exception(f"HTTP {response.status}")
            data = json.loads(response.read().decode())
            
            weather_map = {}
            if 'daily' in data:
                dates = data['daily']['time']
                codes = data['daily']['weather_code']
                for d, c in zip(dates, codes):
                    weather_map[d] = convert_wmo(c)
            return weather_map
    except Exception as e:
        print(f"⚠️ 과거 날씨 실패: {e}")
        return None

def fetch_7day_forecast():
    """[NEW] 미래 7일 예보 (실전용)"""
    print(f"🔮 [미래] 7일간의 일기예보 수집 중...")
    url = f"https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}&daily=weather_code&timezone=Asia%2FSeoul&forecast_days=7"
    try:
        with urllib.request.urlopen(url) as response:
            if response.status != 200: raise Exception(f"HTTP {response.status}")
            data = json.loads(response.read().decode())
            
            forecast_map = {}
            if 'daily' in data:
                dates = data['daily']['time']
                codes = data['daily']['weather_code']
                for d, c in zip(dates, codes):
                    forecast_map[d] = convert_wmo(c)
            
            print(f"✅ 7일 예보 확보: {len(forecast_map)}일치")
            return forecast_map
    except Exception as e:
        print(f"⚠️ 예보 수집 실패: {e}")
        return {}

# ==============================================================================
# 3. 메인 로직
# ==============================================================================
def run_extraction():
    print("🚀 Model Generator 시작 (Hybrid: Past + Future)")
    
    csv_files = glob.glob(os.path.join(RAW_DATA_DIR, "**", "*.csv"), recursive=True)
    if not csv_files:
        print("❌ CSV 파일 없음.")
        return

    # 1. 날짜 범위 파악
    all_dates = []
    for fpath in csv_files:
        try:
            df = pd.read_csv(fpath, encoding='cp949', usecols=[2])
            dates = [d.split('(')[0].strip() for d in df.iloc[:, 0].astype(str).tolist() if '-' in str(d)]
            all_dates.extend(dates)
        except: continue
        
    if not all_dates: return
    all_dates.sort()
    start_date, end_date = all_dates[0], all_dates[-1]

    # 2. 날씨 데이터 수집
    history_weather = fetch_historical_weather(start_date, end_date)
    future_forecast = fetch_7day_forecast() # [추가된 기능]

    if history_weather is None: return 

    # 3. 데이터 분석 (기존 로직 유지)
    base_data = {} 
    monthly_totals = {}
    weather_totals = {} 
    
    for fpath in csv_files:
        try:
            df = pd.read_csv(fpath, encoding='cp949')
            for index, row in df.iterrows():
                try:
                    station = str(row.iloc[0]).split('[')[0].strip()
                    if station == "nan": continue
                    date_only = str(row.iloc[2]).split('(')[0].strip()
                    dt = datetime.strptime(date_only, "%Y-%m-%d")
                    day_type = get_holiday_status(date_only)
                    weather = history_weather.get(date_only, "Clear")
                    
                    if station not in base_data: base_data[station] = { 'Workday': {}, 'Holiday': {} }
                    
                    col_idx = 3
                    while col_idx < len(df.columns) - 1:
                        if not re.search(r'(\d+)', str(df.columns[col_idx])): 
                            col_idx += 2; continue
                        hour = int(re.search(r'(\d+)', str(df.columns[col_idx])).group(1))
                        try: board = int(row.iloc[col_idx]); alight = int(row.iloc[col_idx+1])
                        except: board=0; alight=0
                        
                        if hour not in base_data[station][day_type]:
                            base_data[station][day_type][hour] = {'b': [], 'a': []}
                        base_data[station][day_type][hour]['b'].append(board)
                        base_data[station][day_type][hour]['a'].append(alight)
                        
                        if dt.month not in monthly_totals: monthly_totals[dt.month] = []
                        monthly_totals[dt.month].append(board)
                        if weather not in weather_totals: weather_totals[weather] = []
                        weather_totals[weather].append(board)
                        
                        col_idx += 2
                except: continue
        except: continue

    # 계수 산출
    base_load_final = {}
    for st, days in base_data.items():
        base_load_final[st] = {}
        for dtype, hours in days.items():
            base_load_final[st][dtype] = {}
            for h, vals in hours.items():
                avg_b = sum(vals['b'])/len(vals['b']) if vals['b'] else 0
                avg_a = sum(vals['a'])/len(vals['a']) if vals['a'] else 0
                base_load_final[st][dtype][h] = {'b': round(avg_b), 'a': round(avg_a)}

    yearly_avg = sum(sum(vs) for vs in monthly_totals.values()) / sum(len(vs) for vs in monthly_totals.values()) if monthly_totals else 1
    seasonal_factors = {m: round((sum(monthly_totals[m])/len(monthly_totals[m])) / yearly_avg, 2) for m in monthly_totals} if monthly_totals else {}
    for m in range(1,13): 
        if m not in seasonal_factors: seasonal_factors[m] = 1.0

    base_w_avg = sum(weather_totals["Clear"]) / len(weather_totals["Clear"]) if "Clear" in weather_totals else 1.0
    weather_factors = {w: round((sum(vs)/len(vs))/base_w_avg, 2) for w, vs in weather_totals.items()}

    # 4. 저장 (FORECAST 포함)
    output_obj = {
        "BASE_LOAD": base_load_final,
        "SEASON_FACTORS": seasonal_factors,
        "WEATHER_FACTORS": weather_factors,
        "FORECAST": future_forecast,  # [핵심] 여기에 미래 7일 날씨가 저장됩니다
        "META": { "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S") }
    }
    
    js_content = "const MODEL_CONSTANTS = " + json.dumps(output_obj, ensure_ascii=False, indent=4) + ";"
    
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f: f.write(js_content)
        print(f"Success: Updated {OUTPUT_FILE}")
    except Exception as e: print(f"Error: {e}")
    
    try:
        if os.path.exists(os.path.dirname(OUTPUT_FILE_DESKTOP)):
            with open(OUTPUT_FILE_DESKTOP, 'w', encoding='utf-8') as f: f.write(js_content)
    except: pass

if __name__ == "__main__":
    run_extraction()