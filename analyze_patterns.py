import json
from datetime import datetime
from collections import defaultdict

def analyze_data():
    try:
        with open('data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Error: data.json not found.")
        return

    # Stats containers
    dow_stats = defaultdict(list)
    hour_stats = defaultdict(list)
    weather_stats = defaultdict(list)
    holiday_stats = defaultdict(list)
    
    # For singularities
    all_events = []

    print(f"Total days in dataset: {len(data)}")

    for date_str, info in data.items():
        meta = info.get('meta', {})
        hourly = info.get('hourly', {})

        dow = meta.get('dow')
        weather = meta.get('weather')
        is_holiday = meta.get('holiday')
        is_weekend = meta.get('weekend')

        daily_max_cong = 0
        
        for hour, stations in hourly.items():
            # Calculate average congestion for this hour across all stations
            # Or max? Gimpo Goldline is defined by its peak. Let's look at Peak Congestion.
            # Usually "Gimpo Airport" or "Gochan" has the max load/cong.
            # Let's take the MAXIMUM congestion of any station at this hour as the "Line Congestion"
            
            max_station_cong = 0
            if stations:
                max_station_cong = max(s['cong'] for s in stations)
            
            if max_station_cong > 0:
                dow_stats[dow].append(max_station_cong)
                hour_stats[int(hour)].append(max_station_cong)
                if weather: weather_stats[weather].append(max_station_cong)
                holiday_stats['Holiday' if is_holiday else 'Non-Holiday'].append(max_station_cong)
                
                daily_max_cong = max(daily_max_cong, max_station_cong)

                # Track events for singularities
                all_events.append({
                    'date': date_str,
                    'hour': hour,
                    'cong': max_station_cong,
                    'weather': weather,
                    'dow': dow,
                    'holiday': is_holiday
                })

    # analyze
    print("\n[Analysis Results]")
    
    # 1. Day of Week
    days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    print("\n1. Average Peak Congestion by Day of Week:")
    for i in range(7):
        vals = dow_stats[i]
        avg = sum(vals)/len(vals) if vals else 0
        print(f"  {days[i]}: {avg:.2f}%")

    # 2. Weather
    print("\n2. Average Peak Congestion by Weather:")
    for w, vals in weather_stats.items():
        avg = sum(vals)/len(vals) if vals else 0
        print(f"  {w}: {avg:.2f}% (Samples: {len(vals)})")

    # 3. Holiday
    print("\n3. Average Peak Congestion by Holiday Status:")
    for h, vals in holiday_stats.items():
        avg = sum(vals)/len(vals) if vals else 0
        print(f"  {h}: {avg:.2f}%")

    # 4. Singularities (Top 10 Highest Congestion)
    print("\n4. Top 10 Singularities (Highest Congestion Events):")
    all_events.sort(key=lambda x: x['cong'], reverse=True)
    for i, e in enumerate(all_events[:10]):
        d_name = days[e['dow']]
        print(f"  #{i+1}: {e['date']} ({d_name}) {e['hour']}h - {e['cong']}% | Weather: {e['weather']} | Holiday: {e['holiday']}")

if __name__ == "__main__":
    analyze_data()
