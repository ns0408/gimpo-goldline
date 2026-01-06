import os
import glob
import pandas as pd
import re

RAW_DATA_DIR = os.path.join(os.getcwd(), "raw_data")

def analyze_ridership():
    print("running analysis...")
    csv_files = glob.glob(os.path.join(RAW_DATA_DIR, "**", "*.csv"), recursive=True)
    if not csv_files:
        print("No CSV files found.")
        return

    station_stats = {}
    total_board_sum = 0
    total_alight_sum = 0
    
    # Track daily totals to spot specific days with huge gaps
    daily_stats = {}

    for fpath in csv_files:
        try:
            df = pd.read_csv(fpath, encoding='cp949')
            # Assuming standard structure: Station, Line, Date, 05-Board, 05-Alight, ...
            
            for index, row in df.iterrows():
                try:
                    station = str(row.iloc[0]).split('[')[0].strip()
                    if station == "nan": continue
                    
                    # Sum all boarding/alighting columns
                    daily_board = 0
                    daily_alight = 0
                    
                    col_idx = 3
                    while col_idx < len(df.columns) - 1:
                         # Check if column header has digit (hour)
                        if not re.search(r'(\d+)', str(df.columns[col_idx])): 
                            col_idx += 2; continue
                        
                        try:
                            b = int(row.iloc[col_idx])
                            a = int(row.iloc[col_idx+1])
                        except:
                            b=0; a=0
                        
                        daily_board += b
                        daily_alight += a
                        col_idx += 2
                    
                    if station not in station_stats:
                        station_stats[station] = {'board': 0, 'alight': 0}
                    
                    station_stats[station]['board'] += daily_board
                    station_stats[station]['alight'] += daily_alight
                    
                    total_board_sum += daily_board
                    total_alight_sum += daily_alight
                    
                except Exception as e:
                    # print(f"Row error: {e}")
                    continue
        except Exception as e:
            print(f"File error {fpath}: {e}")
            continue

    print(f"\n{'='*50}")
    print(f"📊 Raw Ridership Analysis Code")
    print(f"{'='*50}")
    print(f"{'Station':<15} | {'Boarding':>12} | {'Alighting':>12} | {'Diff (B-A)':>12} | {'Ratio (B/A)':>6}")
    print(f"{'-'*70}")
    
    sorted_stations = sorted(station_stats.keys())
    # Ensure Gimpo Airport is last or highlighted
    
    for st in sorted_stations:
        b = station_stats[st]['board']
        a = station_stats[st]['alight']
        diff = b - a
        ratio = b / a if a > 0 else 0
        print(f"{st:<15} | {b:>12,} | {a:>12,} | {diff:>12,} | {ratio:>6.2f}")

    print(f"{'-'*70}")
    print(f"{'TOTAL':<15} | {total_board_sum:>12,} | {total_alight_sum:>12,} | {total_board_sum - total_alight_sum:>12,}")
    print(f"{'='*50}")
    
    gimpo = station_stats.get('김포공항', {'board': 0, 'alight': 0})
    print("\n🔍 Gimpo Airport Specifics:")
    print(f"   - Boarding: {gimpo['board']:,}")
    print(f"   - Alighting: {gimpo['alight']:,}")
    if gimpo['alight'] > 0:
        print(f"   - Boarding is only {gimpo['board']/gimpo['alight']*100:.1f}% of Alighting")
        
    if total_board_sum < total_alight_sum * 0.9:
        print("\n⚠️  MAJOR DATA IMBALANCE DETECTED: Total Boarding is significantly less than Alighting.")
        print("   This strongly suggests missing tagging data (e.g. transfer gates at Gimpo Airport).")

if __name__ == "__main__":
    analyze_ridership()
