import requests
import json

# User provided info
HEX_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"
BASE_URL = "http://apis.data.go.kr/1613000/TripVolumebyStop/getDailyTripVolumebyStop"
DATE = "20231025" # Recent weekday
GIMPO_SGG_CD = "41570"

# Station IDs provided by user
STATIONS = {
    "4920": "양촌",
    "4921": "구래",
    "4929": "김포공항"
}

def test_station(id_val, name):
    print(f"\n--- Testing Station: {name} ({id_val}) ---")
    
    # Try different parameter names for the ID
    variations = [
        {"sttn_id": id_val},  # Standard MOLIT param
        {"ars_no": id_val},   # ARS Number
        {"sttnId": id_val},   # CamelCase
        {"arsId": id_val},
        {"stopId": id_val} 
    ]
    
    for v in variations:
        params = {
            "serviceKey": HEX_KEY,
            "pageNo": "1",
            "numOfRows": "10",
            "dataType": "JSON",
            "opr_ymd": DATE,
            "sgg_cd": GIMPO_SGG_CD,
            "ctpv_cd": "41" # Required
        }
        params.update(v)
        
        try:
            resp = requests.get(BASE_URL, params=params, timeout=5)
            if resp.status_code == 200:
                print(f"Param {v}: {resp.text[:200]}")
            else:
                print(f"Param {v}: Error {resp.status_code}")
        except Exception as e:
            print(f"Error: {e}")

# Run tests
for id_val, name in STATIONS.items():
    test_station(id_val, name)
