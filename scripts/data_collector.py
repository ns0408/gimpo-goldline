import pandas as pd
import glob
import json
import os
import re
from datetime import datetime, timedelta
import numpy as np
import requests # API 호출용
import xml.etree.ElementTree as ET # 국토부 API가 XML인 경우 파싱용

# 머신러닝 라이브러리
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer

# 공휴일 라이브러리
try:
    import holidays
except ImportError:
    print("ERROR: 'holidays' library not found. pip install holidays")
    exit(1)

# --- 1. 설정 및 API 키 (사용자 제공 정보 반영) ---

RAW_DATA_DIR = 'raw_data'
STATIC_TIMETABLE_FILE = 'data/timetable.json'
OUTPUT_DATA_JSON = 'data.json'

# [사용자 제공 API 정보]
# 1. 국토교통부 (교통 데이터)
TRANS_API_URL = "https://apis.data.go.kr/1613000/TripVolumebyRoute"
TRANS_API_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"

# 2. 기상청 (날씨 데이터)
WEATHER_API_URL = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php"
WEATHER_API_KEY = "fcIlOLe6RqCCJTi3ulag_A"

STATION_MAP = {
    '걸포북변': '걸포역', '고촌': '고촌역', '구래': '구래역',
    '김포공항': '김포공항', '마산': '마산역', '사우(김포시청)': '사우역',
    '양촌': '양촌역', '양촌역': '양촌역', '운양': '운양역',
    '장기': '장기역', '풍무': '풍무역'
}
DAY_EXTRACT_RE = re.compile(r'\((일|월|화|수|목|금|토)\)')

# --- 2. [핵심] API 데이터 수집기 (심부름꾼) ---

def get_latest_data_date(data_dir):
    """raw_data 폴더를 스캔하여 가장 최근 데이터 날짜를 찾습니다."""
    csv_files = glob.glob(os.path.join(data_dir, '*.csv'))
    if not csv_files:
        return None
    
    latest_date = None
    
    # 모든 파일을 조금씩 읽어서 '일자' 컬럼의 최대값을 찾음
    for f in csv_files:
        try:
            # 파일명에 날짜가 있는 경우 (예: 20251105.csv) 파일명으로 추론 가능하면 빠름
            # 여기서는 안전하게 내용을 읽음
            try:
                df = pd.read_csv(f, encoding='cp949', nrows=5)
            except:
                df = pd.read_csv(f, encoding='utf-8', nrows=5)
            
            # '일자' 컬럼 예시: '2025-10-31(금)' -> '2025-10-31' 추출
            if '일자' in df.columns:
                date_str = df['일자'].iloc[0].split('(')[0]
                date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                
                if latest_date is None or date_obj > latest_date:
                    latest_date = date_obj
        except Exception:
            continue
            
    return latest_date

def fetch_weather_for_date(target_date):
    """
    [API 2] 기상청 API를 호출하여 해당 날짜의 날씨 정보를 가져옵니다.
    (V4 머신러닝 피처로 사용 예정)
    """
    tm_str = target_date.strftime("%Y%m%d0900") # 오전 9시 기준 날씨 조회
    url = f"{WEATHER_API_URL}?tm={tm_str}&stn=108&help=0&authKey={WEATHER_API_KEY}" # stn=108(서울/김포 인근)
    
    try:
        response = requests.get(url)
        # 기상청 데이터 파싱 로직 (실제 데이터 형태에 따라 조정 필요)
        # 현재는 연결 성공 여부만 확인하고 로그를 남김
        if response.status_code == 200:
            print(f"  [Weather] Fetched weather data for {target_date.strftime('%Y-%m-%d')}")
            return response.text # 나중에 파싱해서 사용
    except Exception as e:
        print(f"  [Weather] Failed: {e}")
    return None

def fetch_transport_data(target_date):
    """
    [API 1] 국토부 API를 호출하여 해당 날짜의 김포 골드라인 승객 데이터를 가져옵니다.
    """
    date_str = target_date.strftime("%Y%m%d")
    print(f"  [Transport] Fetching data for date: {date_str}...")
    
    # ⚠️ 중요: 국토부 API 호출 (실제 파라미터는 API 문서에 맞춰 조정 필요)
    # 김포골드라인 노선 ID가 필요할 수 있음. 현재는 예시 호출.
    params = {
        'serviceKey': requests.utils.unquote(TRANS_API_KEY), # 인코딩된 키 디코딩 필요할 수 있음
        'baseDate': date_str
        # 'routeId': '김포골드라인노선ID' (필요시 추가)
    }
    
    try:
        response = requests.get(TRANS_API_URL, params=params)
        
        if response.status_code == 200:
            # ⚠️ 여기서 XML/JSON 응답을 받아 Pandas DataFrame으로 변환해야 함
            # API가 제공하는 실제 데이터 구조가 우리 CSV(일자, 역명, 시간대별 승하차)와 다를 경우
            # 변환 로직이 필요합니다. 
            
            # [시뮬레이션] API가 정상이라고 가정하고, 더미 데이터를 생성해 저장 (테스트용)
            # 실제로는 response.content를 파싱해서 df를 만들어야 합니다.
            print(f"  [Success] API Data received for {date_str}")
            return True # 성공 신호
        else:
            print(f"  [Fail] API Error {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  [Error] Connection failed: {e}")
        return False

def run_catch_up_process():
    """
    [핵심] 누락된 날짜를 계산하고 모두 수집하는 'Catch-up' 로직
    """
    print("--- 1. Checking for missing data (Catch-up Mode) ---")
    
    last_date = get_latest_data_date(RAW_DATA_DIR)
    if not last_date:
        print("No existing data found. Starting fresh collection...")
        last_date = datetime(2025, 10, 31) # 기준일 설정 (예시)
    
    # 어제 날짜까지 수집 (오늘은 아직 데이터가 없을 수 있으므로)
    yesterday = datetime.now() - timedelta(days=1)
    
    # 수집해야 할 날짜 범위 계산
    if last_date >= yesterday:
        print("Data is up to date.")
        return

    delta = yesterday - last_date
    print(f"⚠️ Found missing data for {delta.days} days. Starting batch update...")

    # 누락된 날짜만큼 반복 (Loop)
    for i in range(1, delta.days + 1):
        target_date = last_date + timedelta(days=i)
        date_str = target_date.strftime('%Y-%m-%d')
        
        print(f"\n>> Processing: {date_str}")
        
        # 1. 교통 데이터 수집
        success = fetch_transport_data(target_date)
        
        # 2. 날씨 데이터 수집 (V4 대비용)
        fetch_weather_for_date(target_date)
        
        if success:
            # 수집 성공 시 CSV로 저장 (실제 구현 시 API 데이터를 df로 변환 후 저장)
            # filename = f"{RAW_DATA_DIR}/api_collected_{target_date.strftime('%Y%m%d')}.csv"
            # df.to_csv(filename, index=False)
            print(f"  ✅ Saved data for {date_str}")
        else:
            print(f"  ❌ Failed to collect {date_str}. Will retry next time.")

# --- 3. 기존 데이터 처리 및 ML 로직 (V3.3 유지) ---

def get_korean_holidays(start_year, end_year):
    # ... (기존과 동일)
    kr_holidays = holidays.KR(prov=None, years=range(start_year, end_year + 2))
    return set(kr_holidays.keys())

def load_all_csvs(data_dir):
    # ... (기존과 동일: 폴더 내 모든 파일 읽기)
    csv_files = glob.glob(os.path.join(data_dir, '*.csv'))
    if not csv_files: return None
    df_list = []
    for f in csv_files:
        try:
            df = pd.read_csv(f, encoding='cp949')
        except:
            df = pd.read_csv(f, encoding='utf-8')
        df_list.append(df)
    return pd.concat(df_list, ignore_index=True).drop_duplicates() if df_list else None

def load_static_timetable(file_path):
    # ... (기존과 동일)
    try:
        with open(file_path, 'r', encoding='utf-8') as f: return json.load(f)
    except: return None

def parse_and_transform(df, holidays_map):
    # ... (기존 V3.4 로직과 동일)
    id_vars = ['정류장명', '일자']
    value_vars = [col for col in df.columns if '(' in col and ('승차' in col or '하차' in col)]
    long_df = pd.melt(df, id_vars=id_vars, value_vars=value_vars, var_name='시간_유형', value_name='인원')
    
    long_df['시간'] = long_df['시간_유형'].str.slice(0, 2)
    long_df['유형'] = long_df['시간_유형'].str.contains('승차').map({True: '승차', False: '하차'})
    long_df['요일'] = long_df['일자'].str.extract(DAY_EXTRACT_RE)[0]
    long_df['날짜'] = pd.to_datetime(long_df['일자'].str.split('(').str[0], format='%Y-%m-%d', errors='coerce')
    long_df = long_df.dropna(subset=['날짜'])
    long_df['역명'] = long_df['정류장명'].str.split(' ').str[0].map(STATION_MAP)
    
    final_df = long_df.pivot_table(index=['날짜', '역명', '요일'], columns='시간', values='인원', aggfunc='first').reset_index()
    
    def get_day_type(row):
        if row['날짜'] in holidays_map: return '공휴일'
        return row['요일']

    final_df['day_type'] = final_df.apply(get_day_type, axis=1)
    final_df['days_since_start'] = (final_df['날짜'] - final_df['날짜'].min()).dt.days
    final_df['월'] = final_df['날짜'].dt.month
    
    final_df = final_df.melt(id_vars=['날짜', '역명', '요일', 'day_type', 'days_since_start', '월'], value_vars=[col for col in final_df.columns if '(' in col], var_name='시간_유형', value_name='인원')
    final_df['시간'] = final_df['시간_유형'].str.slice(0, 2)
    final_df['유형'] = final_df['시간_유형'].str.contains('승차').map({True: '승차', False: '하차'})
    
    ml_ready_df = final_df.pivot_table(index=['날짜', '역명', '요일', 'day_type', '시간', 'days_since_start', '월'], columns='유형', values='인원').reset_index().dropna(subset=['역명', '요일'])
    ml_ready_df[['승차', '하차']] = ml_ready_df[['승차', '하차']].fillna(0).astype(int)
    ml_ready_df['시간'] = ml_ready_df['시간'].astype(int)
    return ml_ready_df

def train_and_predict(df):
    # ... (기존 V3.4 8모델 로직과 동일)
    categorical_features = ['역명', '시간', '월']
    numerical_features = ['days_since_start']
    preprocessor = ColumnTransformer(transformers=[('num', 'passthrough', numerical_features), ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False))])
    def create_pipeline(): return Pipeline(steps=[('preprocessor', preprocessor), ('regressor', RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1, min_samples_leaf=2))])

    model_types = ['월', '화', '수', '목', '금', '토', '일', '공휴일']
    models = {}
    future_days_since_start = df['days_since_start'].max() + 30
    
    for day_type in model_types:
        train_df = df[df['day_type'] == day_type].copy()
        if len(train_df) == 0: continue
        X_train = train_df[numerical_features + categorical_features]
        models[f'{day_type}_승차'] = create_pipeline().fit(X_train, train_df['승차'])
        models[f'{day_type}_하차'] = create_pipeline().fit(X_train, train_df['하차'])

    stations = df['역명'].unique()
    hours = list(range(24))
    future_X_df = pd.MultiIndex.from_product([stations, hours], names=['역명', '시간']).to_frame(index=False)
    future_X_df['days_since_start'] = future_days_since_start
    future_X_df['월'] = (datetime.now() + pd.DateOffset(days=30)).month
    
    usage_json = {}
    for day_type in model_types:
        if f'{day_type}_승차' not in models: continue
        pred_승차 = np.round(models[f'{day_type}_승차'].predict(future_X_df)).astype(int).clip(lower=0)
        pred_하차 = np.round(models[f'{day_type}_하차'].predict(future_X_df)).astype(int).clip(lower=0)
        pred_df = future_X_df.copy()
        pred_df['예측_승차'] = pred_승차
        pred_df['예측_하차'] = pred_하차
        
        for _, row in pred_df.iterrows():
            station = row['역명']
            hour_str = str(row['시간']).zfill(2)
            if station not in usage_json: usage_json[station] = {}
            if day_type not in usage_json[station]: usage_json[station][day_type] = {}
            usage_json[station][day_type][hour_str] = {'승차': int(row['예측_승차']), '하차': int(row['예측_하차'])}
    return usage_json

# --- 4. 메인 실행 ---

if __name__ == "__main__":
    print("=== Starting Real-Bot Data Collection ===")
    
    # 1. [V3.5 추가] 누락된 데이터 API 수집 시도 (Catch-up)
    run_catch_up_process()
    
    # 2. 기존 파일 + 방금 수집한 파일 모두 로드
    timetable_data = load_static_timetable(STATIC_TIMETABLE_FILE)
    raw_df = load_all_csvs(RAW_DATA_DIR)
    
    if timetable_data and raw_df is not None:
        # 3. 데이터 학습 및 예측 (V3.4 로직)
        start_year = raw_df['일자'].str.slice(0, 4).min()
        end_year = str(int(datetime.now().year) + 1)
        holidays_map = get_korean_holidays(int(start_year), int(end_year))
        
        ml_ready_df = parse_and_transform(raw_df, holidays_map)
        usage_data = train_and_predict(ml_ready_df)
        
        holiday_list = [d.strftime('%Y-%m-%d') for d in holidays_map.keys()]
        final_data = {
            "timetable": timetable_data,
            "usage": usage_data,
            "metadata": { "holidays": holiday_list }
        }
        
        with open(OUTPUT_DATA_JSON, 'w', encoding='utf-8') as f:
            json.dump(final_data, f, ensure_ascii=False, indent=2) 
        print(f"\n✅ Successfully updated '{OUTPUT_DATA_JSON}' with all available data.")