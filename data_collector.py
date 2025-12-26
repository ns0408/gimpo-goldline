import os
import pandas as pd
import json
import re
from datetime import datetime
import random
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import OneHotEncoder
import numpy as np

# Configuration
RAW_DIR = "raw_data"
STATION_ORDER = [
    "1.양촌", "2.구래", "3.마산", "4.장기", "5.운양", 
    "6.걸포북변", "7.사우(김포시청)", "8.풍무", "9.고촌", "10.김포공항"
]
# Clean names for JSON
STATION_MAP = {
    "1.양촌": "양촌", "2.구래": "구래", "3.마산": "마산", "4.장기": "장기",
    "5.운양": "운양", "6.걸포북변": "걸포북변", "7.사우(김포시청)": "사우",
    "8.풍무": "풍무", "9.고촌": "고촌", "10.김포공항": "김포공항"
}

# Holiday List (2024.12 - 2025.11) - Manual for precision
HOLIDAYS = [
    "2024-12-25", # Xmas
    "2025-01-01", # New Year
    "2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30", # Seollal
    "2025-03-01", # Samiljeol
    "2025-03-03", # Substitute?
    "2025-05-05", "2025-05-06", # Children/Buddha
    "2025-06-06", # Memorial
    "2025-08-15", # Liberation
    "2025-10-03", # Foundation
    "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08", # Chuseok (Approx)
    "2025-10-09", # Hangeul
    "2025-12-25"  # Xmas
]

# User Events
# Format: (Start, End, Name, StationName)
EVENTS = [
    ("2025-04-11", "2025-04-12", "CherryBlossom", "풍무"),
    ("2025-06-14", "2025-06-17", "AraMarine", "고촌"),
    ("2025-09-27", "2025-09-27", "Dadam", "운양"),
    ("2025-10-18", "2025-10-18", "Laveniche", "장기")
]

# Train Capacity (2 cars)
CAPACITY = 350 # Dense capacity

def get_weather_sim(date_str):
    # Simulate weather based on season 
    # (Since API blocked, this ensures the CODE LOGIC works)
    dt = pd.to_datetime(date_str)
    month = dt.month
    
    # Rain/Snow Probability
    prob = 0.05
    type_w = "Clear"
    
    if month in [7, 8]: # Summer Rain
        prob = 0.3
        type_w = "Rain"
    elif month in [12, 1, 2]: # Winter Snow
        prob = 0.15
        type_w = "Snow"
        
    if random.random() < prob:
        return type_w
    return "Clear"

def train_ml_model(df_train):
    # Train a simple Linear Regression model per Station & Hour
    # Features: DoW (0-6), IsHoliday (0/1), Weather (OneHot), Month (1-12)
    models = {}
    
    # Preprocessing
    # Map weather to numeric
    weather_map = {"Clear": 0, "Rain": 1, "Snow": 2}
    
    # We will build a model for each Station-Hour pair for maximum precision
    # or a general model. Let's do Station-Hour specific models.
    
    stations = df_train['station'].unique()
    hours = df_train['time'].unique()
    
    print("Training ML models...")
    
    for st in stations:
        models[st] = {}
        st_df = df_train[df_train['station'] == st]
        
        for h in hours:
            h_df = st_df[st_df['time'] == h]
            if len(h_df) < 5: continue # Not enough data
            
            X = []
            y = []
            
            for _, row in h_df.iterrows():
                dt = pd.to_datetime(row['date'])
                dow = dt.weekday()
                is_holiday = 1 if (row['date'] in HOLIDAYS) or (dow >= 5) else 0
                month = dt.month
                w_code = weather_map.get(get_weather_sim(row['date']), 0) # Use sim weather consistency
                
                X.append([dow, is_holiday, month, w_code])
                y.append(row['cong'])
            
            if not X: continue
            
            model = LinearRegression()
            model.fit(X, y)
            models[st][h] = model
            
    return models

def predict_ml_values(models, date_str, weather_str):
    # Generate predictions for a given date context
    preds = {} # { "HH": { "Station": val } }
    
    dt = pd.to_datetime(date_str)
    dow = dt.weekday()
    is_holiday = 1 if (date_str in HOLIDAYS) or (dow >= 5) else 0
    month = dt.month
    weather_map = {"Clear": 0, "Rain": 1, "Snow": 2}
    w_code = weather_map.get(weather_str, 0)
    
    X_input = [[dow, is_holiday, month, w_code]]
    
    for st, h_models in models.items():
        for h, model in h_models.items():
            pred_cong = model.predict(X_input)[0]
            pred_cong = max(0, int(round(pred_cong)))
            
            if str(h) not in preds: preds[str(h)] = {}
            preds[str(h)][st] = pred_cong
            
    return preds

def process_data():
    # 1. Load Existing Data or Raw?
    # Requirement: "Manual update process... using collected data"
    # We will assume we re-process RAW data to build the DB.
    
    print("Reading files...")
    all_rows = []
    
    # ... (Same file reading logic as before, condensed for brevity) ...
    for station_folder in STATION_ORDER:
        raw_name = STATION_MAP[station_folder]
        folder_path = os.path.join(RAW_DIR, station_folder)
        if not os.path.exists(folder_path): continue
        for f in os.listdir(folder_path):
            if not (f.endswith('.csv') or f.endswith('.xls')): continue
            fpath = os.path.join(folder_path, f)
            try:
                try: df = pd.read_csv(fpath, encoding='cp949')
                except: 
                    try: df = pd.read_csv(fpath, encoding='cp949', header=None, skiprows=1)
                    except: df = pd.read_excel(fpath)
                
                date_col = None
                for col in df.columns:
                    if re.search(r'\d{4}-\d{2}-\d{2}', str(df[col].iloc[0])):
                        date_col = col; break
                if not date_col and len(df.columns) > 2: date_col = df.columns[2]
                if not date_col: continue

                for idx, row in df.iterrows():
                    date_raw = str(row[date_col]).split('(')[0]
                    try: 
                        date_obj = pd.to_datetime(date_raw)
                        date_str = date_obj.strftime("%Y-%m-%d")
                        if date_obj.year < 2024: continue # Skip junk
                    except: continue
                    
                    for h in range(4, 24):
                        h_str = f"{h:02d}"
                        on_col = [c for c in df.columns if h_str in str(c) and '승차' in str(c)]
                        off_col = [c for c in df.columns if h_str in str(c) and '하차' in str(c)]
                        on_val, off_val = 0, 0
                        if on_col: on_val = pd.to_numeric(row[on_col[0]], errors='coerce') or 0
                        if off_col: off_val = pd.to_numeric(row[off_col[0]], errors='coerce') or 0
                        
                        all_rows.append({ "date": date_str, "time": h, "station": raw_name, "on": on_val, "off": off_val })
            except: pass

    print(f"Loaded {len(all_rows)} rows. Processing...")
    df_main = pd.DataFrame(all_rows)
    
    # 2. Calculate Congestion for ML Training
    training_data = [] # List of dicts
    
    dates = df_main['date'].unique()
    
    # Helper to calc daily congestion map
    # We need a structure: Date -> Hour -> Station -> Congestion
    # to train the model effectively.
    
    # Process Line Load logic first
    final_data = {} 
    
    # Pre-calculate congestion for all historical points
    for d in sorted(dates):
        day_df = df_main[df_main['date'] == d]
        daily_weather = get_weather_sim(d)
        
        # Meta info
        is_holiday = d in HOLIDAYS
        dow = pd.to_datetime(d).weekday()
        is_weekend = dow >= 5
        
        final_data[d] = {
            "meta": {
                "dow": dow, "holiday": is_holiday, "weekend": is_weekend, "weather": daily_weather
            },
            "hourly": {},
            # "ml_pred": {} # Will fill later
        }
        
        for h in range(4, 24):
            hour_df = day_df[day_df['time'] == h]
            current_load = 0
            station_res = []
            
            for s_name in STATION_MAP.values():
                s_row = hour_df[hour_df['station'] == s_name]
                on = s_row.iloc[0]['on'] if not s_row.empty else 0
                off = s_row.iloc[0]['off'] if not s_row.empty else 0
                
                current_load += (on - off)
                if current_load < 0: current_load = 0
                cong = int(round((current_load / CAPACITY) * 100))
                
                if cong > 400: cong = 0 # Outlier cleaning for training data
                
                station_res.append({ "station": s_name, "cong": cong })
                
                # Add to training set
                training_data.append({
                    "date": d, "time": h, "station": s_name, "cong": cong
                })
            
            final_data[d]["hourly"][h] = station_res

    # 3. Train ML Model
    train_df = pd.DataFrame(training_data)
    models = train_ml_model(train_df)
    
    # 4. Generate ML Predictions for Every Day (Ensemble Base)
    # Even for historical days, we store what the ML *would* have predicted given just meta.
    # This serves as the 'Base' for our application logic.
    print("Generating ML base predictions...")
    
    for d in final_data:
        w_str = final_data[d]['meta']['weather']
        
        # Generate prediction context
        preds = predict_ml_values(models, d, w_str)
        final_data[d]['ml_pred'] = preds

    # 5. Save
    with open("data.json", "w", encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False)
    print("Saved data.json with ML predictions")

if __name__ == "__main__":
    process_data()
