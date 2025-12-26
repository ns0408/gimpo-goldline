import requests
import pandas as pd
import time
from datetime import datetime, timedelta
import os

# User Key
KEY = "fcIlOLe6RqCCJTi3ulag_A" 
# KMA ASOS Hourly Data Service
# We need to find the correct endpoint. The user gave a specific URL before:
# https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php
# But that looks like "Current Weather".
# For past data, we usually use: http://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList
# However, that requires a different Service Key (Encoding/Decoding issue).
# Let's try to use the key provided with the KMA Hub URL pattern if possible, 
# or try the public data portal endpoint with the user's key (assuming it works for KMA too, which it might not).
#
# VALIDATED APPROACH:
# The user's key "fcIlOLe..." worked for "apihub.kma.go.kr" in the previous test.
# Let's check if APIHub has an "Archive" or "Range" endpoint.
# Usually: https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php?tm1=...&tm2=... (sfctm3 is often for range)
# Let's try searching or guessing. 
# 
# PLAN B: If APIHub is hard to guess, we use the standard Public Data Portal endpoint using the OTHER key?
# User gave two keys.
# Key 1 (KMA): fcIlOLe...
# Key 2 (MOLIT): 076fe...
#
# Let's try Key 1 with standard Public Data Portal first, as it's cleaner JSON.
# Endpoint: getWthrDataList (ASOS Hourly)
# Station: 108 (Seoul) - Most reliable, or 201 (Gimpo Airport)

BASE_URL = "http://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList"

START_DATE = "20241201"
END_DATE = "20251129"
STATION_ID = "108" # Seoul (representative)

def fetch_weather():
    # Split into chunks (e.g. 1 month) to limit row count
    current = datetime.strptime(START_DATE, "%Y%m%d")
    end = datetime.strptime(END_DATE, "%Y%m%d")
    
    all_data = []
    
    while current <= end:
        next_month = current + timedelta(days=29) # Roughly 1 month
        if next_month > end:
            next_month = end
            
        start_str = current.strftime("%Y%m%d")
        end_str = next_month.strftime("%Y%m%d")
        
        print(f"Fetching {start_str} ~ {end_str}...")
        
        params = {
            "serviceKey": KEY, # Try raw key
            "pageNo": "1",
            "numOfRows": "999",
            "dataType": "JSON",
            "dataCd": "ASOS",
            "dateCd": "HR",
            "startDt": start_str,
            "startHh": "00",
            "endDt": end_str,
            "endHh": "23",
            "stnIds": STATION_ID
        }
        
        try:
            # Note: The key might need decoding. Let's try both if fail.
            resp = requests.get(BASE_URL, params=params, timeout=10)
            
            # Check JSON
            try:
                data = resp.json()
                items = data['response']['body']['items']['item']
                for item in items:
                    # Keep: Time, Temp, Rain
                    all_data.append({
                        "tm": item['tm'], # YYYY-MM-DD HH:00
                        "temp": item['ta'],
                        "rain": item.get('rn', 0.0) # Rain might be null or empty
                    })
            except:
                # If JSON fails, maybe key error or XML
                print("Failed to parse JSON. Response excerpt:", resp.text[:200])
                if "SERVICE_KEY_IS_NOT_REGISTERED" in resp.text:
                    print("Key is not registered for Public Data Portal. Trying APIHub URL...")
                    return False
        except Exception as e:
            print(f"Error: {e}")
            
        current = next_month + timedelta(days=1)
        time.sleep(0.5)
        
    # Save
    if all_data:
        df = pd.DataFrame(all_data)
        df.to_csv("weather_history.csv", index=False)
        print(f"Saved {len(df)} rows to weather_history.csv")
        return True
    return False

def fetch_weather_apihub():
    # Fallback: Scrape APIHub if the standard API fails
    # This is tricky because APIHub docs aren't fully public/standardized.
    # URL provided: https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=...
    # Try looping through all hours? That's 24 * 365 requests. Too many.
    # Hope 'sfctm3' (range) works or just randomize valid 'rain' days for simulation?
    # 
    # USER CONSTRAINT: "Fetch Real Data".
    # I will stick to attempting the standard API first.
    pass

if __name__ == "__main__":
    success = fetch_weather()
    if not success:
        # If the key provided for APIHub doesn't work on Data.go.kr,
        # We might need to ask the user or stick to the specific APIHub endpoint.
        # But 'kma_sfctm2.php' takes a single 'tm' (timestamp).
        print("Standard API failed. The provided key might be APIHub-only.")
        # I will Create a dummy weather file for now to proceed, 
        # but warn the user. Or try the MOLIT key?
        # Let's try the MOLIT key on the Weather API? (Unlikely to work)
        pass
