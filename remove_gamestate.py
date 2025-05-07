import re

file_path = 'app.py'

# Pattern to match the gameState definition block
pattern = re.compile(r'# 移除全局变量 gameState.*?# \}', re.DOTALL)

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the gameState block
modified_content = pattern.sub('', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(modified_content)

print(f"Removed gameState block from {file_path}")
