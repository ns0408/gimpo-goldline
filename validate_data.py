import os
import pandas as pd
import glob
import re

# Goal: Verify data from 2024-12-01 to 2025-11-29 for all 10 stations
TARGET_START = pd.Timestamp("2024-12-01")
TARGET_END = pd.Timestamp("2025-11-29")
STATIONS = ["1.양촌", "2.구래", "3.마산", "4.장기", "5.운양", "6.걸포북변", "7.사우(김포시청)", "8.풍무", "9.고촌", "10.김포공항"]

BASE_DIR = r"c:/Users/박남순/.gemini/antigravity/playground/photonic-cassini/gimpo-goldline/raw_data"

def check_data():
    report = []
    
    for station in STATIONS:
        print(f"Checking {station}...")
        station_path = os.path.join(BASE_DIR, station)
        if not os.path.exists(station_path):
            report.append(f"[MISSING] Station folder not found: {station}")
            continue
            
        all_files = glob.glob(os.path.join(station_path, "*.csv"))
        if not all_files:
             # Try .xls or .xlsx if STCIS default download
            all_files = glob.glob(os.path.join(station_path, "*.xls*"))
            
        if not all_files:
            report.append(f"[EMPTY] No files in {station}")
            continue

        # Load all dates from all files to check for gaps
        collected_dates = set()
        
        for f in all_files:
            try:
                # STCIS usually gives XLS but extension might be CSV or XLS. 
                # Let's try reading as CSV first, if fail, read as Excel.
                # It often ignores extension.
                try:
                    df = pd.read_csv(f, encoding='cp949') 
                except:
                    # Sometimes headers are messy, try reading without header then assigning
                    try:
                         df = pd.read_csv(f, encoding='cp949', header=None, skiprows=1)
                    except:
                         df = pd.read_excel(f)

                # Inspect columns. If header is garbled, use index.
                # In the sample: Col 0=Station, Col 1=?, Col 2=Date
                date_col_name = None
                
                # Check based on sample content (YYYY-MM-DD)
                for col in df.columns:
                    sample = str(df[col].iloc[0])
                    if re.search(r'\d{4}-\d{2}-\d{2}', sample):
                        date_col_name = col
                        break
                
                if date_col_name is None:
                    # Fallback to 3rd column (index 2)
                    if len(df.columns) > 2:
                        date_col_name = df.columns[2]
                
                if date_col_name is None:
                     report.append(f"[FORMAT] Could not find Date column in {os.path.basename(f)}")
                     continue
                
                # Clean date string: Remove (월), (화) etc.
                raw_dates = df[date_col_name].astype(str).str.split('(').str[0]
                dates = pd.to_datetime(raw_dates, errors='coerce').dropna()
                
                # Filter weird dates (e.g. 1900s if excel default)
                dates = dates[dates.dt.year > 2000]
                
                collected_dates.update(dates)
                
            except Exception as e:
                report.append(f"[ERROR] Reading {os.path.basename(f)}: {e}")
        
        if not collected_dates:
             report.append(f"[NO DATA] Valid dates not found in {station}")
             continue
             
        min_date = min(collected_dates)
        max_date = max(collected_dates)
        
        # Check coverage
        if min_date > TARGET_START:
             report.append(f"[GAP START] {station}: Starts at {min_date.date()} (Expected {TARGET_START.date()})")
        if max_date < TARGET_END:
             report.append(f"[GAP END] {station}: Ends at {max_date.date()} (Expected {TARGET_END.date()})")
             
        # Check for missing days in between
        full_range = pd.date_range(start=max(min_date, TARGET_START), end=min(max_date, TARGET_END))
        missing = [d for d in full_range if d not in collected_dates]
        if missing:
            report.append(f"[MISSING DAYS] {station}: {len(missing)} days missing (e.g., {missing[0].date()})")
        else:
            report.append(f"[OK] {station}: {min_date.date()} ~ {max_date.date()} (Complete)")

    print("\nXXX REPORT START XXX")
    for r in report:
        print(r)
    print("XXX REPORT END XXX")

if __name__ == "__main__":
    check_data()
