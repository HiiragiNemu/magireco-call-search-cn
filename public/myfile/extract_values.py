import re
import os

# 要查找的文件名
css_filename = "charaBox_png.css"
output_filename = "output.txt"

# 检查文件是否存在于当前目录
if not os.path.exists(css_filename):
    print(f"找不到 {css_filename}，请确认文件位于当前目录。")
    exit(1)

# 读取 CSS 文件内容
with open(css_filename, 'r', encoding='utf-8') as f:
    content = f.read()

# 正则表达式匹配所有 input[value="xxx"] 的 xxx 内容
pattern = r'input\[value="(.*?)"\]\s*\{'
matches = re.findall(pattern, content)

# 写入输出文件
with open(output_filename, 'w', encoding='utf-8') as f:
    for match in matches:
        f.write(match + '\n')

print(f"提取完成，共 {len(matches)} 项，结果保存至 {output_filename}")
