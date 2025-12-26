import json
import datetime

# Load Data
with open('data.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

def predict(target_date_str, target_weather, station, hour):
    target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d")
    target_dow = target_date.weekday() # 0=Mon, 6=Sun
    # Javascript getDay(): 0=Sun, 1=Mon... 6=Sat. 
    # Python weekday(): 0=Mon, 6=Sun.
    # WE MUST MATCH JS LOGIC or CONVERT.
    # Params passed to JS `new Date('2025-10-13').getDay()` -> 0 (Sun).
    # Python `weekday()` for 2025-10-13 is 6 (Sun).
    # Let's align to JS getDay() convention for scoring: 0=Sun, 1=Mon...
    js_dow = (target_dow + 1) % 7
    
    is_target_weekend = (js_dow == 0 or js_dow == 6)
    target_month = target_date.month - 1 # JS Month 0-11
    
    print(f"--- Predicting for {target_date_str} ({js_dow}), Weather: {target_weather} ---")

    similar_days = []
    
    for k, day_data in db.items():
        score = 0
        meta = day_data['meta']
        
        # 1. DoW (50pts)
        if meta['dow'] == js_dow: score += 50
        
        # 2. Holiday/Weekend (30pts)
        db_is_holiday = meta['holiday'] or meta['weekend']
        # For simplicity, assuming target is holiday if weekend
        if db_is_holiday == is_target_weekend: score += 30
        
        # 3. Weather (20pts)
        if meta['weather'] == target_weather: score += 20
        
        # 4. Season (10pts)
        h_date = datetime.datetime.strptime(k, "%Y-%m-%d")
        h_month = h_date.month - 1
        if h_month == target_month: score += 10
        elif abs(h_month - target_month) <= 1: score += 5
            
        similar_days.append({'date': k, 'score': score, 'data': day_data})
        
    # Sort
    similar_days.sort(key=lambda x: x['score'], reverse=True)
    top5 = similar_days[:5]
    
    print("Top 5 Matches:")
    for d in top5:
        print(f" - {d['date']}: Score {d['score']} (Weather: {d['data']['meta']['weather']}, Cong: {get_cong(d['data'], station, hour)})")
        
    # Calculate Avg with Outlier Filter
    total_cong = 0
    count = 0
    
    for item in top5:
        cong = get_cong(item['data'], station, hour)
        if cong is not None:
            if cong > 400:
                print(f"   [FILTERED] Outlier Detected: {cong}% on {item['date']}")
                continue
            total_cong += cong
            count += 1
            
    avg = round(total_cong / count) if count > 0 else 0
    print(f"Final Prediction: {avg}%")
    return avg

def get_cong(day_data, station, hour):
    h_str = str(hour)
    if 'hourly' in day_data and h_str in day_data['hourly']:
        for s in day_data['hourly'][h_str]:
            if s['station'] == station:
                return s['cong']
    return None

# Test Cases
# 1. Outlier Check: 2025-10-13 is the 1900% day. Let's predict for a similar Sunday.
# Target: 2025-10-20 (Sun), Weather: Clear
predict('2025-10-20', 'Clear', '양촌', 7)

# 2. Weather Check: Predict for a Rainy Monday
print("\n=== WEATHER IMPACT TEST ===")
res_rain = predict('2025-07-14', 'Rain', '고촌', 8)
res_clear = predict('2025-07-14', 'Clear', '고촌', 8)

if res_rain != res_clear:
    print(f"\nSUCCESS: Weather impacted prediction! Rain: {res_rain}%, Clear: {res_clear}%")
else:
    print(f"\nWARNING: Weather did not impact prediction result value. (Both {res_rain}%) - Check scores.")
