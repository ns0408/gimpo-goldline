import requests
import json

# User provided info
HEX_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"
# Endpoint for "Stop by Route"
BASE_URL = "http://apis.data.go.kr/1613000/StopbyRouteTripVolume/getDailyStopbyRouteTripVolume"
DATE = "20231025" # Recent weekday

# Candidate Route IDs for Gimpo Goldline
CANDIDATES = [
    "41090001", # Gyeonggi standard
    "11100000", # Seoul standard
    "1613000",  # User's suggestion (Service ID)
    "I4109",    # Incheon/Gimpo style?
    "100"       # Simple ID?
]

def test_route_id(rid):
    print(f"\n--- Testing Route ID: {rid} ---")
    params = {
        "serviceKey": HEX_KEY,
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "JSON",
        "opr_ymd": DATE,
        "routeId": rid,
        # "sggCd": "41570" # Optional?
    }
    
    try:
        resp = requests.get(BASE_URL, params=params, timeout=5)
        print(f"Status: {resp.status_code}")
        # print specific error or success
        if '"resultCode":"00"' in resp.text:
            print("SUCCESS! Found valid Route ID.")
            print(resp.text[:500])
        else:
            print(f"Result: {resp.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")

for c in CANDIDATES:
    test_route_id(c)
