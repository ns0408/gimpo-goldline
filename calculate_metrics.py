
import json
import math
from collections import Counter

# Load data
with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Helper function to get predicted congestion using weighted k-NN (simplified Python version of JS logic)
def predict_congestion(target_station, target_hour, target_day_type, target_month=10, target_weather="Clear"):
    # Filter candidates
    candidates = []
    
    for date_str, day_data in data.items():
        # Skip if no hourly data for this hour
        if str(target_hour) not in day_data.get('hourly', {}):
            continue
            
        # Check outliers
        hourly_data = day_data['hourly'][str(target_hour)]
        station_data = next((s for s in hourly_data if s['station'] == target_station), None)
        
        if not station_data or station_data['cong'] > 400: # Filter outliers
            continue
            
        day_type_score = 50 if day_data.get('day_type') == target_day_type else 0
        weather_score = 20 if day_data.get('weather') == target_weather else 0
        # Ignore holiday/month for simplicity/speed in this verification script
        
        score = day_type_score + weather_score
        candidates.append({
            'date': date_str,
            'score': score,
            'cong': station_data['cong']
        })
    
    # Sort by score desc
    candidates.sort(key=lambda x: x['score'], reverse=True)
    
    # Take top 5
    k = 5
    top_candidates = candidates[:k]
    
    if not top_candidates:
        return None
        
    avg_cong = sum(c['cong'] for c in top_candidates) / len(top_candidates)
    return avg_cong

# Calculate Metrics
# We will use Leave-One-Out validation on a sample or just run on the whole dataset (predicting each point using others)
# For speed, let's pick 100 random points.

import random
random.seed(42)

test_points = []
all_dates = list(data.keys())
sample_dates = random.sample(all_dates, min(100, len(all_dates))) # Sample 100 days

y_true = []
y_pred = []

print(f"Running validation on {len(sample_dates)} days...")

for date_str in sample_dates:
    day_data = data[date_str]
    target_day_type = day_data.get('day_type', 'Weekday')
    target_weather = day_data.get('weather', 'Clear')
    
    # Pick a random hour and station that exists in this day
    if 'hourly' not in day_data: continue
    
    available_hours = list(day_data['hourly'].keys())
    if not available_hours: continue
    
    target_hour = random.choice(available_hours)
    
    station_entries = day_data['hourly'][target_hour]
    if not station_entries: continue
    
    target_entry = random.choice(station_entries)
    
    actual_cong = target_entry['cong']
    target_station = target_entry['station']
    
    if actual_cong > 400: continue # Skip outlier truth
    
    # Predict (we verify by pretending we don't know this date - in a real leave-one-out we'd exclude it from candidates)
    # But candidates implementation above includes ALL dates.
    # To correspond to 'predicting unknown future', we should exclude current date from candidates.
    # Let's modify predict_congestion briefly or just accept small bias?
    # Better: Manual candidate filtering here.
    
    # Re-implement simplified prediction logic loop here to exclude 'date_str'
    candidates = []
    for cand_date, cand_data in data.items():
        if cand_date == date_str: continue # LEAVE ONE OUT
        
        if str(target_hour) not in cand_data.get('hourly', {}): continue
        
        cand_hourly = cand_data['hourly'][str(target_hour)]
        cand_station_data = next((s for s in cand_hourly if s['station'] == target_station), None)
        
        if not cand_station_data or cand_station_data['cong'] > 400: continue
        
        d_score = 50 if cand_data.get('day_type') == target_day_type else 0
        w_score = 20 if cand_data.get('weather') == target_weather else 0
        
        candidates.append({'cong': cand_station_data['cong'], 'score': d_score + w_score})
        
    candidates.sort(key=lambda x: x['score'], reverse=True)
    top_k = candidates[:5]
    
    if not top_k: continue
    
    pred_cong = sum(c['cong'] for c in top_k) / len(top_k)
    
    y_true.append(actual_cong)
    y_pred.append(pred_cong)

# Compute Metrics
n = len(y_true)
if n == 0:
    print("No valid test points found.")
    exit()

mse = sum((t - p) ** 2 for t, p in zip(y_true, y_pred)) / n
rmse = math.sqrt(mse)

mape_sum = 0
valid_mape_count = 0
for t, p in zip(y_true, y_pred):
    if t != 0:
        mape_sum += abs((t - p) / t)
        valid_mape_count += 1

mape = (mape_sum / valid_mape_count) * 100 if valid_mape_count > 0 else 0

print(f"Results (n={n}):")
print(f"RMSE: {rmse:.2f}")
print(f"MAPE: {mape:.2f}%")

