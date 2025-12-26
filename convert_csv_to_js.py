
import os
import json

csv_path = 'assets/schedule.csv'
js_path = 'assets/embedded_data.js'

if not os.path.exists(csv_path):
    print(f"Error: {csv_path} not found")
    exit(1)

with open(csv_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Escape backticks for JS template literal
escaped_content = content.replace('`', '\\`')

# Create JS content
js_content = f"const RAW_SCHEDULE_CSV = `{escaped_content}`;"

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"Successfully created {js_path} ({len(js_content)} bytes)")
