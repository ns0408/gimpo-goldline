import requests
import xml.etree.ElementTree as ET

# User provided info
API_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"
# Base URL: https://apis.data.go.kr/6410000/busarrivalservice/v2
# Endpoint: getBusArrivalListv2 (Arrival List at Station)
URL = "https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2"

# Test Station ID (from previous turn, likely a valid Gyeonggi Endpoint?)
# 233001456 = Something in Gimpo? Let's verify.
STATION_ID = "233001456"

def test_api():
    params = {
        "serviceKey": API_KEY, # In python requests, this might be double encoded if not careful, but let's try raw first.
        # Often with public data portal, you need the decoded key if requests handles encoding, 
        # OR the encoded key if you pass it manually. 
        # The string provided looks decoded (no %).
        "stationId": STATION_ID
    }

    try:
        print(f"Sending request to {URL} with stationId={STATION_ID}...")
        response = requests.get(URL, params=params)
        
        print("Status Code:", response.status_code)
        print("Content Start:", response.text[:500])

        if response.status_code == 200:
            # Check if Service Error
            if '<cmmMsgHeader>' in response.text:
                 print("Service Error detected (likely Auth).")
            else:
                 print("Success? Trying to parse XML...")
                 root = ET.fromstring(response.text)
                 # Look for 'busArrivalList'
                 items = root.findall(".//busArrivalList")
                 print(f"Found {len(items)} arriving buses.")
                 for item in items[:3]:
                     route_id = item.findtext("routeId")
                     predict_time1 = item.findtext("predictTime1")
                     plate1 = item.findtext("plateNo1")
                     print(f"- Route {route_id}: {predict_time1} min (Plate: {plate1})")
        else:
            print("HTTP Error")

    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test_api()
