import requests
import json
import urllib.parse
from datetime import datetime, timedelta

# User provided info
HEX_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"

# New User URL: https://apis.data.go.kr/1613000/TripVolumebyStop
# This suggests we probably look for endpoints like:
# - getDailyTripVolumebyStop (Usually needs Stop ID or City Code)
# - getDailyStopbyRouteTripVolume (Might need Route but maybe Stop driven?)

BASE_URL = "http://apis.data.go.kr/1613000/TripVolumebyStop"
DATE = "20231025" # Recent weekday
# Gimpo City Code: 41570
# Seoul Gimpo Airport Station might be in Seoul (11500) or Gimpo? Usually Gimpo Goldline stops are in Gimpo except Gimpo Airport.
GIMPO_SGG_CD = "41570" 

def test_api(endpoint, params):
    url = f"{BASE_URL}/{endpoint}"
    params['serviceKey'] = HEX_KEY
    
    print(f"\n--- Testing {endpoint} ---")
    print(f"Params: {params}")
    try:
        response = requests.get(url, params=params, timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Content: {response.text[:1000]}") # Show more content
    except Exception as e:
        print(f"Error: {e}")

# Test 1: Daily Trip Volume by Stop (List all stops in Gimpo?)
# Params usually: pageNo, numOfRows, dataType, opr_ymd, sgg_cd, ctpv_cd
# Gyeonggi-do code: 41
params1 = {
    "pageNo": "1",
    "numOfRows": "20",
    "dataType": "JSON",
    "opr_ymd": DATE,
    "sgg_cd": GIMPO_SGG_CD,
    "ctpv_cd": "41" 
}
test_api("getDailyTripVolumebyStop", params1)

# Test 2: Try with "sggCd" (CamelCase) just in case
params2 = {
    "pageNo": "1",
    "numOfRows": "20",
    "dataType": "JSON",
    "opr_ymd": DATE,
    "sggCd": GIMPO_SGG_CD
}
test_api("getDailyTripVolumebyStop", params2)

# Test 3: Maybe search for specific Gimpo Goldline station name?
# This endpoint typically doesn't support name search, but let's try just in case standard params fail.
