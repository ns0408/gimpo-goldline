
import os

file_path = 'index.html'
new_header_html = '''        <header class="premium-header">
            <img src="real_keeper_logo.png" alt="Real Keeper Logo" class="header-logo">
            <div class="header-content">
                <h1 class="header-title">김포골드라인<br>AI 혼잡도 예측</h1>
                <div class="header-subtitle">REAL KEEPER Predictive Engine</div>
            </div>
        </header>'''

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_index = -1
end_index = -1

# Locate the logo-section block
for i, line in enumerate(lines):
    if '<div class="logo-section">' in line:
        start_index = i
    if start_index != -1 and '</div>' in line and '<div class="logo-subtext">' in lines[i-1]: # identifying the closing div of logo-section
        # The closing div of logo-section is likely the one after logo-text div closes?
        # Let's inspect the structure:
        # <div class="logo-section">
        #   <img ...>
        #   <div class="logo-text">
        #      ...
        #   </div>
        # </div>
        # So we need to find the second </div> after logo-section start?
        # Actually in the file content viewed:
        # 909: <div class="logo-section">
        # ...
        # 916: </div>
        # and 915 is </div> (closing logo-text)
        # and 914 is <div class="logo-subtext">...</div>
        pass

# Let's refine finding logic:
# Find start line
# Find end line (line 916 in the viewed snippet)
# We know lines 909 to 916 (1-based) are the target.
# In 0-based list, that matches indices 908 to 915.

# Let's verify context to be safe.
# Line 908 (index 907) is <div class="container">
# Line 919 (index 918) corresponds to <!-- Station Name --> logic? No, viewed output had line 918 as <!-- Station Name -->
# Let's simple remove lines 909 to 916 inclusive (1-based).
# Index 908 to 915 inclusive.

target_indices = range(908, 916) # 908, 909, ... 915

# Double check the content of these lines to ensure we are deleting the right thing
print(f"Checking lines {target_indices[0]+1}-{target_indices[-1]+1}...")
for i in target_indices:
    print(f"{i+1}: {lines[i].strip()[:50]}...") # Print first 50 chars

# If safe, replace
if '<div class="logo-section">' in lines[908]:
    print("Found logo-section at line 909.")
    # Remove the old block
    # We want to insert the new block at line 909
    
    # Slicing: keep up to 908, insert new, keep from 916 onwards
    new_lines = lines[:908] + [new_header_html + '\n'] + lines[916:]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Successfully updated index.html")
else:
    print("Error: Line 909 does not contain logo-section. Aborting.")
