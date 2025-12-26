import requests

API_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"
STATION_ID = "233001456"

def test_manual():
    # Construct URL manually to avoid requests encoding the key if it's sensitive
    # Try 1: As provided (Decoded)
    url = f"https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey={API_KEY}&stationId={STATION_ID}"
    
    print(f"Testing URL: {url}")
    
    try:
        resp = requests.get(url)
        print(f"Status: {resp.status_code}")
        print(f"Body: {resp.text[:300]}")
    except Exception as e:
        print(e)

if __name__ == "__main__":
    test_manual()
