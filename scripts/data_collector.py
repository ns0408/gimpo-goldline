import pandas as pd
import glob
import json
import os
import re
from datetime import datetime
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
import holidays

# --- 1. 설정 및 파일 경로 (V4는 API 호출을 멈추고 파일 학습으로 전환) ---

RAW_DATA_DIR = 'raw_data'
STATIC_TIMETABLE_FILE = 'data/timetable.json'
OUTPUT_DATA_JSON = 'data.json'
# 교통량 파일은 폴더 내 모든 CSV를 읽으므로, 파일 이름을 지정하지 않습니다.
WEATHER_DATA_FILE = os.path.join(RAW_DATA_DIR, 'weather_1year.csv') # 1년치 날씨 데이터 파일명 (DAY 2-5에 준비)

STATION_MAP = {
    '걸포북변': '걸포역', '고촌': '고촌역', '구래': '구래역',
    '김포공항': '김포공항', '마산': '마산역', '사우(김포시청)': '사우역',
    '양촌': '양촌역', '양촌역': '양촌역', '운양': '운양역',
    '장기': '장기역', '풍무': '풍무역'
}
DAY_EXTRACT_RE = re.compile(r'\((일|월|화|수|목|금|토)\)')

# --- 2. 데이터 로드 및 전처리 ---

def load_static_timetable(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f: return json.load(f)
    except Exception as e:
        print(f"ERROR: Failed to load timetable.json: {e}")
        return None

def load_traffic_data():
    """ 
    [V4 핵심] raw_data 폴더 내의 모든 CSV 파일을 읽어와 하나로 합칩니다. 
    (파일 이름에 관계 없이 모든 데이터를 통합)
    """
    
    # glob: 폴더 내의 모든 CSV 파일 경로를 찾습니다.
    csv_files = glob.glob(os.path.join(RAW_DATA_DIR, '*.csv'))
    
    if not csv_files:
        print(f"FATAL ERROR: Traffic data CSVs not found in {RAW_DATA_DIR}")
        return None
        
    df_list = []
    
    # 찾은 모든 파일을 순회하며 읽어옵니다. (한글 인코딩 처리 포함)
    for f in csv_files:
        try:
            df = pd.read_csv(f, encoding='cp949')
        except:
            df = pd.read_csv(f, encoding='utf-8')
        df_list.append(df)
        
    # 모든 파일을 하나의 DataFrame으로 합치고 중복을 제거합니다.
    return pd.concat(df_list, ignore_index=True).drop_duplicates() if df_list else None

def load_weather_data():
    """ weather_1year.csv 파일을 로드하고 필요한 컬럼만 추출합니다. """
    if not os.path.exists(WEATHER_DATA_FILE):
        print(f"WARNING: Weather data not found at {WEATHER_DATA_FILE}. Skipping weather features.")
        return None
    try:
        df = pd.read_csv(WEATHER_DATA_FILE, encoding='cp949')
    except:
        df = pd.read_csv(WEATHER_DATA_FILE, encoding='utf-8')
    
    # [주의] 날씨 CSV 파일의 컬럼명이 다를 수 있으므로, 예상 컬럼명으로 통일 (이름이 다르면 이 부분을 수정해야 함)
    df.columns = df.columns.str.replace('[^A-Za-z0-9_]+', '', regex=True)
    
    # 핵심 컬럼만 선택 (예시: 일시, 평균 기온, 일 강수량, 적설량)
    # 다운로드 받은 파일의 컬럼명에 따라 아래 '일시', '평균기온' 등을 수정해야 할 수 있습니다.
    weather_df = df[['일시', '평균기온', '일강수량', '적설량']]
    weather_df.rename(columns={'일시': '날짜', '평균기온': 'AvgTemp', '일강수량': 'Rainfall', '적설량': 'Snow'}, inplace=True)
    
    weather_df['날짜'] = pd.to_datetime(weather_df['날짜'])
    return weather_df.dropna(subset=['날짜'])

def get_korean_holidays(start_year, end_year):
    kr_holidays = holidays.KR(prov=None, years=range(start_year, end_year + 2))
    return set(kr_holidays.keys())

def parse_and_transform(traffic_df, weather_df, holidays_map):
    # 1. 교통 데이터 전처리 (기존 로직 유지)
    id_vars = ['정류장명', '일자']
    value_vars = [col for col in traffic_df.columns if '승차' in col or '하차' in col]
    long_df = pd.melt(traffic_df, id_vars=id_vars, value_vars=value_vars, var_name='시간_유형', value_name='인원')
    long_df['시간'] = long_df['시간_유형'].str.slice(0, 2)
    long_df['유형'] = long_df['시간_유형'].str.contains('승차').map({True: '승차', False: '하차'})
    long_df['날짜'] = pd.to_datetime(long_df['일자'].str.split('(').str[0], format='%Y-%m-%d', errors='coerce')
    long_df = long_df.dropna(subset=['날짜'])
    long_df['요일'] = long_df['날짜'].dt.dayofweek.map({0:'월', 1:'화', 2:'수', 3:'목', 4:'금', 5:'토', 6:'일'})
    long_df['역명'] = long_df['정류장명'].str.split(' ').str[0].map(STATION_MAP)
    
    # 2. 날씨 데이터 병합 (V4 핵심)
    if weather_df is not None:
        long_df = pd.merge(long_df, weather_df, on='날짜', how='left')
    else:
        # 날씨 데이터가 없으면 0으로 채움 (ML 코드가 작동하게 하기 위해)
        long_df['AvgTemp'] = 0
        long_df['Rainfall'] = 0
        long_df['Snow'] = 0

    # 3. ML 학습 형태 변환
    final_df = long_df.pivot_table(index=['날짜', '역명', '요일', 'AvgTemp', 'Rainfall', 'Snow'], columns='시간', values='인원', aggfunc='first').reset_index()
    
    def get_day_type(row):
        if row['날짜'].date() in holidays_map: return '공휴일'
        return row['요일']
    final_df['day_type'] = final_df.apply(get_day_type, axis=1)
    
    final_df['days_since_start'] = (final_df['날짜'] - final_df['날짜'].min()).dt.days
    final_df['월'] = final_df['날짜'].dt.month

    ml_ready_df = final_df.melt(id_vars=['날짜', '역명', '요일', 'day_type', 'days_since_start', '월', 'AvgTemp', 'Rainfall', 'Snow'], 
                                value_vars=[col for col in final_df.columns if len(col) == 2 and col.isdigit()], 
                                var_name='시간', value_name='인원')
    ml_ready_df['시간'] = ml_ready_df['시간'].astype(int)
    
    ml_ready_df = ml_ready_df.pivot_table(index=['날짜', '역명', '요일', 'day_type', '시간', 'days_since_start', '월', 'AvgTemp', 'Rainfall', 'Snow'], 
                                          columns='유형', values='인원').reset_index().dropna(subset=['역명', '요일'])
    ml_ready_df[['승차', '하차']] = ml_ready_df[['승차', '하차']].fillna(0).astype(int)

    return ml_ready_df

# --- 3. ML 학습 및 예측 ---

def train_and_predict(df):
    categorical_features = ['역명', '시간', '월']
    # [V4 변경점]: 날씨 데이터를 수치형 특성(numerical_features)에 추가
    numerical_features = ['days_since_start', 'AvgTemp', 'Rainfall', 'Snow']
    
    preprocessor = ColumnTransformer(transformers=[
        ('num', 'passthrough', numerical_features), 
        ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), categorical_features)
    ])
    
    def create_pipeline(): 
        return Pipeline(steps=[
            ('preprocessor', preprocessor), 
            ('regressor', RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1, min_samples_leaf=2))
        ])
        
    model_types = ['월', '화', '수', '목', '금', '토', '일', '공휴일']
    models = {}
    
    future_days_since_start = df['days_since_start'].max()
    current_month = datetime.now().month

    for day_type in model_types:
        train_df = df[df['day_type'] == day_type].copy()
        if len(train_df) < 100: 
            print(f"Skipping training for {day_type} (Insufficient data: {len(train_df)})")
            continue
            
        X_train = train_df[numerical_features + categorical_features]
        models[f'{day_type}_승차'] = create_pipeline().fit(X_train, train_df['승차'])
        models[f'{day_type}_하차'] = create_pipeline().fit(X_train, train_df['하차'])
        
    # 예측 데이터셋 생성
    stations = df['역명'].unique()
    hours = list(range(24))
    future_X_df = pd.MultiIndex.from_product([stations, hours], names=['역명', '시간']).to_frame(index=False)
    
    # 예측 시의 임시 날씨 특성 (V4 초기에는 0으로 임시 설정)
    future_X_df['days_since_start'] = future_days_since_start
    future_X_df['월'] = current_month
    future_X_df['AvgTemp'] = 0
    future_X_df['Rainfall'] = 0
    future_X_df['Snow'] = 0
    
    usage_json = {}
    for day_type in model_types:
        if f'{day_type}_승차' not in models: continue
        
        pred_승차 = np.round(models[f'{day_type}_승차'].predict(future_X_df[numerical_features + categorical_features])).astype(int).clip(lower=0)
        pred_하차 = np.round(models[f'{day_type}_하차'].predict(future_X_df[numerical_features + categorical_features])).astype(int).clip(lower=0)
        
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
    print("=== Starting V4 Data Collection & ML Training ===")
    
    timetable_data = load_static_timetable(STATIC_TIMETABLE_FILE)
    traffic_df = load_traffic_data()
    weather_df = load_weather_data()
    
    if timetable_data is None or traffic_df is None:
        print("\nFATAL: Required data files are missing. Aborting training.")
        if not os.path.exists(OUTPUT_DATA_JSON):
             with open(OUTPUT_DATA_JSON, 'w', encoding='utf-8') as f:
                json.dump({"metadata": {"holidays": []}, "timetable": {}, "usage": {}}, f)
        exit(1)
        
    print(f"✅ Loaded Traffic Data: {len(traffic_df)} rows")
    if weather_df is not None:
        print(f"✅ Loaded Weather Data: {len(weather_df)} rows")

    try:
        start_year = traffic_df['일자'].str.slice(0, 4).min()
        end_year = str(int(datetime.now().year) + 1)
        holidays_map = get_korean_holidays(int(start_year), int(end_year))
        
        ml_ready_df = parse_and_transform(traffic_df, weather_df, holidays_map)
        print(f"✅ ML Ready Data Shape: {ml_ready_df.shape}")
        
        usage_data = train_and_predict(ml_ready_df)
        holiday_list = [d.strftime('%Y-%m-%d') for d in holidays_map.keys()]
        
        final_data = {
            "timetable": timetable_data,
            "usage": usage_data,
            "metadata": { "holidays": holiday_list, "last_updated": datetime.now().isoformat() }
        }
        
        with open(OUTPUT_DATA_JSON, 'w', encoding='utf-8') as f:
            json.dump(final_data, f, ensure_ascii=False, indent=2) 
            
        print(f"\n✅ V4 Training SUCCESS! '{OUTPUT_DATA_JSON}' updated.")

    except Exception as e:
        print(f"\nFATAL ML ERROR: {e}")
        exit(1)