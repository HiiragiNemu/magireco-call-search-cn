import requests

# 这是网站的核心逻辑和数据文件
DATA_URL = "https://magireco-chara-search.vercel.app/bundle.js"
# 我们先把它下载到项目的根目录，方便你查找
OUTPUT_FILE = "bundle.js" 

print(f"正在下载网站的核心文件: {DATA_URL}")

try:
    response = requests.get(DATA_URL, timeout=60)
    response.raise_for_status()
    response.encoding = 'utf-8'

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(response.text)

    print(f"\n成功！核心文件已保存为: {OUTPUT_FILE}")
    print("\n下一步，请按照指示手动从中提取数据。")

except requests.exceptions.RequestException as e:
    print(f"\n错误：下载数据时发生网络错误: {e}")
except Exception as e:
    print(f"\n发生未知错误: {e}")