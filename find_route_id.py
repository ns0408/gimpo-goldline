import requests
import urllib.parse

# User provided info
HEX_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"

BASE_URL = "http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList"

def test_route_search(route_no):
    params = {
        "serviceKey": HEX_KEY,
        "pageNo": "1",
        "numOfRows": "10",
        "_type": "json",
        "cityCode": "41570", # Gimpo
        "routeNo": route_no
    }
    
    print(f"\n--- Searching for route: {route_no} ---")
    try:
        response = requests.get(BASE_URL, params=params, timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Content: {response.text[:1000]}")
    except Exception as e:
        print(f"Error: {e}")

# Search for "Goldline" variations
# It might be registered as a bus in some systems or just accessible here.
test_route_search("우이신설")
test_route_search("김포골드")
test_route_search("골드라인")
