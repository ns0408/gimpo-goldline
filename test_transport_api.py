import requests
import json
import urllib.parse
from datetime import datetime, timedelta

# User provided info
HEX_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"
# The API requires a decoded key usually, but since we have a HEX string, 
# it's likely the "Decoded" key is the binary bytes of this hex, OR the key IS the hex string.
# Public Data Portal keys are usually Base64.
# Let's try sending the HEX string as is (ServiceKey) first.

BASE_URL = "http://apis.data.go.kr/1613000/TripVolumebyRoute"
ROUTE_ID_CANDIDATE = "1613000" # From search result
DATE = "20231025" # Recent weekday

def test_api(endpoint, params):
    url = f"{BASE_URL}/{endpoint}"
    # Add key to params
    params['serviceKey'] = HEX_KEY
    
    print(f"\n--- Testing {endpoint} ---")
    print(f"Params: {params}")
    try:
        response = requests.get(url, params=params, timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Content: {response.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

# Test variations
variations = [
    # Case A: Maybe parameter is routeCd?
    {"pageNo": "1", "numOfRows": "10", "dataType": "JSON", "opr_ymd": DATE, "routeCd": ROUTE_ID_CANDIDATE},
    # Case B: Maybe needs sggCd? (Gimpo = 41570)
    {"pageNo": "1", "numOfRows": "10", "dataType": "JSON", "opr_ymd": DATE, "routeId": ROUTE_ID_CANDIDATE, "sggCd": "41570"},
    # Case C: Maybe routeId is different? Try searching by Name? (Usually not supported in this endpoint but worth a shot if params differ)
    # Case D: Just sggCd without route?
    {"pageNo": "1", "numOfRows": "10", "dataType": "JSON", "opr_ymd": DATE, "sggCd": "41570"},
]

for i, v in enumerate(variations):
    # Always use the correct endpoint name
    test_api("getDailyTripVolumebyRoute", v)

