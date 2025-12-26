
import csv
import json
import os

csv_path = 'assets/schedule.csv'
js_path = 'assets/schedule_data.js'

data = []
if os.path.exists(csv_path):
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Filter out empty rows
            if row['역이름'] and row['시간']:
                # Clean up the row dictionary (remove empty keys if any)
                clean_row = {k: v for k, v in row.items() if k and k.strip()}
                data.append(clean_row)

# Create the JS content
# We format it nicely so the user can edit it easily
js_content = "window.MANUAL_SCHEDULE_DATA = " + json.dumps(data, ensure_ascii=False, indent=4) + ";"

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"Successfully created {js_path} with {len(data)} rows.")
