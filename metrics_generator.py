import os
import glob
import pandas as pd
import json
import re

# Configuration
RAW_DATA_DIR = r"C:\Users\박남순\OneDrive\Desktop\gimpo-goldline\raw_data"
OUTPUT_FILE_DESKTOP = r"C:\Users\박남순\OneDrive\Desktop\gimpo-goldline\assets\ridership_data.js"
OUTPUT_FILE_WORKSPACE = r"c:/Users/박남순/.gemini/antigravity/playground/photonic-cassini/gimpo-goldline/assets/ridership_data.js"

def parse_ridership():
    print("Starting Ridership Analysis...")
    
    # Storage: { "Station": { "Weekday": { h: {b: sum, a: sum, count: n} }, "Weekend": ... } }
    agg_data = {}

    csv_files = glob.glob(os.path.join(RAW_DATA_DIR, "**", "*.csv"), recursive=True)
    print(f"Found {len(csv_files)} CSV files.")

    if not csv_files:
        print("No CSV files found!")
        return

    for fpath in csv_files:
        try:
            # Read CSV with CP949 encoding (common for Korean public data)
            # Lines 1 is header.
            df = pd.read_csv(fpath, encoding='cp949')
            
            # Simple check of columns
            # Column 0: Station Name (assumed)
            # Column 2: Date (e.g. 2024-12-01(일))
            
            for index, row in df.iterrows():
                station_raw = str(row.iloc[0]).strip()
                date_str = str(row.iloc[2]).strip()
                
                # Cleanup Station Name (Remove brackets e.g. "구래 [도시철도]")
                station = station_raw.split('[')[0].strip()
                if station == "nan": continue

                # Determine Day Type
                is_weekend = '토' in date_str or '일' in date_str
                day_type = 'Weekend' if is_weekend else 'Weekday'

                if station not in agg_data:
                    agg_data[station] = { 'Weekday': {}, 'Weekend': {} }
                
                target_store = agg_data[station][day_type]

                # Iterate Columns for Hours
                # Structure: 04(B), 04(A), 05(B), 05(A)...
                # Start index 3.
                # Headers usually: "04(승차)", "04(하차)"...
                
                col_idx = 3
                num_cols = len(df.columns)
                
                # We assume pairs.
                while col_idx < num_cols - 1:
                    header = str(df.columns[col_idx])
                    # Extract Hour
                    # "04(승차)" -> 4
                    hour_match = re.search(r'(\d+)', header)
                    if not hour_match:
                        col_idx += 2
                        continue
                        
                    hour = int(hour_match.group(1))
                    
                    board = row.iloc[col_idx]
                    alight = row.iloc[col_idx+1]
                    
                    # Handle NaNs
                    try:
                        board = int(board)
                    except: board = 0
                    try:
                        alight = int(alight)
                    except: alight = 0
                    
                    if hour not in target_store:
                        target_store[hour] = {'b': 0, 'a': 0, 'c': 0}
                    
                    target_store[hour]['b'] += board
                    target_store[hour]['a'] += alight
                    target_store[hour]['c'] += 1
                    
                    col_idx += 2

        except Exception as e:
            print(f"Error processing {fpath}: {e}")

    # Generate JSON content
    # Format: "Station": { hour: { board: AVG, alight: AVG } } ... 
    # Current Request: "Window.RIDERSHIP_DATA" structure.
    # Wait, the app currently uses simple { h: {board, alight} } and inputs "Day" into logic.
    # The user asked for differentiation: "Task 1... Weekday/Weekend separate".
    # So I should output:
    # window.RIDERSHIP_DATA = { "Station": { "Weekday": { h: ... }, "Weekend": { h: ... } } }
    # Or flattened? 
    # User Example: "양촌": { 5: {board:12...} } <- This looks like single structure?
    # Ah, User said: "Weekday and Weekend distinguish".
    # Result object: "Station": { "DayType": { h... } } would be best.
    # But current `script.js` expects `window.getRidership(st, h)`.
    # I will modify `script.js` to look for keys properly.
    # Let's generate:
    # window.RIDERSHIP_DATA = {
    #   "양촌": {
    #       "평일": { 5: {b:.., a:..}, ... },
    #       "주말": { 5: {b:.., a:..}, ... }
    #   }
    # }

    final_obj = {}
    
    for st, days in agg_data.items():
        final_obj[st] = { "평일": {}, "주말": {} }
        
        # Weekday
        for h, v in days['Weekday'].items():
            count = v['c'] if v['c'] > 0 else 1
            final_obj[st]["평일"][h] = {
                'board': round(v['b'] / count),
                'alight': round(v['a'] / count)
            }
            
        # Weekend
        for h, v in days['Weekend'].items():
            count = v['c'] if v['c'] > 0 else 1
            final_obj[st]["주말"][h] = {
                'board': round(v['b'] / count),
                'alight': round(v['a'] / count)
            }

    js_content = "window.RIDERSHIP_DATA = " + json.dumps(final_obj, ensure_ascii=False, indent=4) + ";"
    
    # Save
    with open(OUTPUT_FILE_WORKSPACE, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"Saved to Workspace: {OUTPUT_FILE_WORKSPACE}")
    
    try:
        with open(OUTPUT_FILE_DESKTOP, 'w', encoding='utf-8') as f:
            f.write(js_content)
        print(f"Saved to Desktop: {OUTPUT_FILE_DESKTOP}")
    except Exception as e:
        print(f"Failed to save to Desktop: {e}")

if __name__ == "__main__":
    parse_ridership()
