import requests
import urllib.parse
import base64

# User provided info (Hex)
HEX_KEY = "076fe95cc0f5cdb0e84e4005e7349546816f968f6569c0ae64db2e216d6728c3"
BASE64_KEY = "B2/pXMD1zbDoTkAF5zSVRoFvlo9lacCuZNsuIW1nKMM="
API_URL = "http://apis.data.go.kr/1613000/TripVolumebyRoute/getDailyTripVolumebyRoute"
target_date = "20251130" 

def test_manual_url(desc, key, params_str):
    print(f"\n--- Testing {desc} ---")
    # Manually construct URL to control encoding
    full_url = f"{API_URL}?serviceKey={key}&{params_str}"
    print(f"URL: {full_url}")
    
    try:
        resp = requests.get(full_url)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:300]}")
    except Exception as e:
        print(f"Failed: {e}")

# Params string
p_str = f"pageNo=1&numOfRows=10&dataType=JSON&opr_ymd={target_date}"

# Test 1: Base64 Key Unencoded (Dangerous but worth trying if server handles it)
# Note: + will be interpreted as space, / as path sep? No, in query it's fine usually.
test_manual_url("Base64 Key Unencoded", BASE64_KEY, p_str)

# Test 2: Base64 Key Encoded (Standard)
encoded_key = urllib.parse.quote(BASE64_KEY)
test_manual_url("Base64 Key Encoded", encoded_key, p_str)

# Test 3: Base64 Key Double Encoded
double_encoded_key = urllib.parse.quote(encoded_key)
test_manual_url("Base64 Key Double Encoded", double_encoded_key, p_str)

# Test 4: Hex Key (Just in case)
test_manual_url("Hex Key", HEX_KEY, p_str)

# Test 5: Try parameter case variations with Hex Key (since it gave 200 OK)
# Maybe PageNo? NumOfRows?
p_str_case = f"PageNo=1&NumOfRows=10&DataType=JSON&opr_ymd={target_date}"
test_manual_url("Hex Key + PascalCase Params", HEX_KEY, p_str_case)
