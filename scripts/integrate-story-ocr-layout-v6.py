#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

RELEASE = "story-ocr-layout-v6-20260816"
OLD_RELEASE = "integrated-tools-v5-20260816"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old, new, 1)


def add_css(text: str) -> str:
    if './myfile/layout-v6.css' in text:
        return text
    for indent in ("  ", "\t"):
        anchor = f'{indent}<link rel="stylesheet" href="./myfile/tools-suite.css">'
        if anchor in text:
            ref = f'{indent}<link rel="stylesheet" href="./myfile/layout-v6.css">'
            return text.replace(anchor, anchor + "\n" + ref, 1)
    raise SystemExit("tools-suite CSS anchor: no supported indentation found")


def update_release(text: str) -> str:
    text = text.replace(f'data-build="{OLD_RELEASE}"', f'data-build="{RELEASE}"')
    if text.count(f'data-build="{RELEASE}"') != 1:
        raise SystemExit("release marker was not updated exactly once")
    return text


def patch_index() -> None:
    path = Path("public/index.html")
    text = update_release(add_css(path.read_text(encoding="utf-8")))
    js_ref = '<script src="./myfile/layout-v6.js"></script>'
    if js_ref not in text:
        anchor = '<script src="./myfile/tools-suite.js"></script>'
        text = replace_once(text, anchor, anchor + "\n" + js_ref, "root tools-suite JS anchor")
    path.write_text(text, encoding="utf-8")


def patch_story() -> None:
    path = Path("public/story.html")
    text = update_release(add_css(path.read_text(encoding="utf-8")))
    manifest_meta = '<meta name="story-data-manifest" content="./data/story-v6/manifest.json">'
    if manifest_meta not in text:
        description = '  <meta name="description" content="中文角色故事搜索：按故事类型、角色组合和概要关键词筛选魔法纪录故事。">'
        if description not in text:
            raise SystemExit("story description meta anchor missing")
        text = text.replace(description, description + "\n  " + manifest_meta, 1)
    old = (
        "      <p>选择故事类型、角色和组合逻辑，查询角色在哪些故事中共同出现。"
        "角色名、筛选说明和结果界面均以中文显示。</p>"
    )
    new = (
        "      <p>选择故事类型、角色和组合逻辑，在本站保存的完整故事快照中本地筛选。"
        "不再由手机浏览器直接请求 Google Apps Script，因此不会受跨域、Google 重定向或网络屏蔽影响。</p>\n"
        "      <p class=\"story-source-v6\">数据来自原角色故事搜索公开的完整 JSON；本次快照包含 19 类、超过 1.4 万条记录。"
        "快照采用手工静态更新，不修改 magi-reader 仓库。</p>"
    )
    if old in text:
        text = text.replace(old, new, 1)
    elif "story-source-v6" not in text:
        text = text.replace("    </header>", new + "\n    </header>", 1)
    path.write_text(text, encoding="utf-8")


def patch_attendance() -> None:
    path = Path("public/attendance.html")
    text = update_release(add_css(path.read_text(encoding="utf-8")))
    path.write_text(text, encoding="utf-8")


def patch_runes() -> None:
    path = Path("public/runes.html")
    text = update_release(add_css(path.read_text(encoding="utf-8")))
    text = text.replace(
        "      <p>选择只保留魔女文字区域的图片，将符文识别为拉丁字母。图片不会上传至本站服务器，识别在当前浏览器内完成。</p>",
        "      <p>上传原图即可。V6 会自动判断明暗、移除长边框、裁切文字区域，并按单行、多行或字母表执行多方案识别。图片不会上传至本站服务器。</p>",
        1,
    )
    text = text.replace(
        "            <p>建议先裁掉无关画面，只保留一行或一组魔女文字；文字与背景反差越大越好。</p>",
        "            <p>支持黑底白字、白底黑字、上下边框、背景纹理和多行字母表。复杂图片可选择“自动去边框”或指定布局。</p>",
        1,
    )
    old_preprocess = '''          <label class="suite-field" for="runesPreprocess">
            <span>图像预处理</span>
            <select id="runesPreprocess" class="suite-select">
              <option value="auto">自动判断明暗并增强对比</option>
              <option value="contrast">灰度高对比</option>
              <option value="invert">反色高对比</option>
              <option value="original">保持原图</option>
            </select>
          </label>'''
    new_preprocess = '''          <label class="suite-field" for="runesPreprocess">
            <span>图像预处理</span>
            <select id="runesPreprocess" class="suite-select">
              <option value="auto">智能多方案（推荐）</option>
              <option value="border">强制自动去边框／去背景</option>
              <option value="contrast">灰度高对比</option>
              <option value="invert">反色高对比</option>
              <option value="original">保持原图</option>
            </select>
          </label>
          <label class="suite-field" for="runesLayout">
            <span>文字布局</span>
            <select id="runesLayout" class="suite-select">
              <option value="auto">自动判断</option>
              <option value="line">单行文字</option>
              <option value="block">多行／段落</option>
              <option value="chart">字母表／规则网格（高精度逐字）</option>
              <option value="character">单个字符</option>
            </select>
          </label>'''
    text = replace_once(text, old_preprocess, new_preprocess, "runes preprocessing controls")
    text = text.replace('class="suite-grid two" style="margin-top:12px"', 'class="suite-grid" style="margin-top:12px"', 1)
    old_canvas = '        <canvas id="runesCanvas" hidden></canvas>'
    new_canvas = '''        <div class="runes-processed-wrap-v6">
          <h3>处理后图像</h3>
          <canvas id="runesCanvas" class="runes-preview" aria-label="自动去边框和二值化后的识别图像" hidden></canvas>
        </div>'''
    text = replace_once(text, old_canvas, new_canvas, "runes processed canvas")
    old_notice = '      <p class="suite-notice">OCR 结果可能受字体变体、透视、压缩噪点和背景纹理影响。建议尝试切换预处理方式或重新裁切图片。</p>'
    new_notice = '''      <pre id="runesDiagnostics" class="runes-diagnostics-v6" aria-label="OCR 候选方案诊断"></pre>
      <p class="suite-notice">V6 会比较原图、去边框二值图、备用极性、整行与逐字识别结果，并按置信度、字符数量和重复噪声选择最佳候选。透视严重时仍建议先校正画面。</p>'''
    text = replace_once(text, old_notice, new_notice, "runes result notice")
    path.write_text(text, encoding="utf-8")


def patch_release_metadata() -> None:
    path = Path("public/build-info.json")
    value = json.loads(path.read_text(encoding="utf-8"))
    value["release"] = RELEASE
    value["rollbackBeforeStoryOcrLayoutV6"] = "rollback/pre-story-ocr-layout-v6-20260816"
    value["storyDataMode"] = "local-manual-static-snapshot"
    value["storySnapshotManifest"] = "public/data/story-v6/manifest.json"
    value["storyBrowserRemoteDependency"] = False
    value["ocrPipeline"] = "multi-pass-border-aware-layout-aware-classic-tesseract"
    value["characterStarLayout"] = "top-right-corner"
    value["suiteCharacterCardLayout"] = "content-height-compact"
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_expected_releases() -> None:
    files = [
        "public/__acceptance.html",
        "scripts/smoke-neo11-v3.mjs",
        "scripts/smoke-height-guide-v4.mjs",
        "scripts/smoke-integrated-tools-v5.mjs",
    ]
    pattern = re.compile(r"const EXPECTED_RELEASE = '[^']+';")
    for filename in files:
        path = Path(filename)
        text = path.read_text(encoding="utf-8")
        text, count = pattern.subn(f"const EXPECTED_RELEASE = '{RELEASE}';", text, count=1)
        if count != 1:
            raise SystemExit(f"{filename}: expected release constant missing")
        if filename.endswith("smoke-integrated-tools-v5.mjs"):
            text = text.replace("initial.types === 14", "initial.types >= 19")
            text = text.replace("story data service returns a renderable result", "local story snapshot returns a renderable result")
        path.write_text(text, encoding="utf-8")


def patch_validation() -> None:
    path = Path("scripts/validate-site.js")
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "  V5: 'integrated-tools-v5-20260816'\n});",
        "  V5: 'integrated-tools-v5-20260816',\n  V6: 'story-ocr-layout-v6-20260816'\n});",
        1,
    )
    text = text.replace(
        "const isV5 = release === RELEASES.V5;",
        "const isV6 = release === RELEASES.V6;\nconst isV5 = release === RELEASES.V5 || isV6;",
        1,
    )
    v6_block = r'''
if (isV6) {
  for (const file of [
    'public/myfile/layout-v6.css', 'public/myfile/layout-v6.js',
    'public/data/story-v6/manifest.json', 'public/data/story-v6/variant-map.json',
    'scripts/build-story-snapshot-v6.py', 'scripts/integrate-story-ocr-layout-v6.py',
    'scripts/smoke-story-layout-v6.mjs', 'scripts/smoke-ocr-v6.mjs'
  ]) requireFile(file);
  for (const page of ['public/index.html', 'public/story.html', 'public/attendance.html', 'public/runes.html']) {
    const pageText = read(page);
    if (!pageText.includes('./myfile/layout-v6.css')) fail(`${page} missing V6 layout CSS.`);
  }
  if (!read('public/index.html').includes('./myfile/layout-v6.js')) fail('root page missing V6 star layout script.');
  const storyPage = read('public/story.html');
  if (!storyPage.includes('./data/story-v6/manifest.json')) fail('story page missing the local manifest marker.');
  if (storyPage.includes('script.google.com/macros/s/')) fail('story page still exposes a remote Google Apps Script endpoint.');
  const storyApp = read('public/myfile/story-app.js');
  for (const marker of ['MANIFEST_URL', 'manual-static-snapshot', 'loadCategory', 'rowMatches']) {
    if (!storyApp.includes(marker)) fail(`V6 story marker missing: ${marker}`);
  }
  if (storyApp.includes('script.google.com/macros/s/')) fail('V6 story app still performs remote GAS searches.');
  const manifest = JSON.parse(read('public/data/story-v6/manifest.json'));
  if (manifest.totalRows < 14000 || manifest.categories.length !== 19) fail('V6 story snapshot is incomplete.');
  let countedRows = 0;
  for (const category of manifest.categories) {
    const file = `public/data/story-v6/${category.file}`;
    requireFile(file);
    const data = JSON.parse(read(file));
    if (data.key !== category.key || !Array.isArray(data.rows) || data.rows.length !== category.count) {
      fail(`V6 story category invalid: ${category.key}`);
    }
    countedRows += data.rows.length;
  }
  if (countedRows !== manifest.totalRows) fail(`V6 story row count mismatch: ${countedRows}/${manifest.totalRows}`);
  const runesPage = read('public/runes.html');
  for (const marker of ['id="runesLayout"', 'value="border"', 'id="runesDiagnostics"', '处理后图像']) {
    if (!runesPage.includes(marker)) fail(`V6 OCR UI marker missing: ${marker}`);
  }
  const runesApp = read('public/myfile/runes-app.js');
  for (const marker of ['otsuThreshold', 'clearLongBorders', 'segmentedRecognition', 'SINGLE_BLOCK', '__RUNE_OCR_V6__']) {
    if (!runesApp.includes(marker)) fail(`V6 OCR marker missing: ${marker}`);
  }
  if (buildInfo.rollbackBeforeStoryOcrLayoutV6 !== 'rollback/pre-story-ocr-layout-v6-20260816') {
    fail('V6 rollback pointer missing or incorrect.');
  }
  if (buildInfo.storyBrowserRemoteDependency !== false) fail('V6 story browser must be independent of remote APIs.');
}
'''
    anchor = "\nif (failed) process.exit(1);"
    if "if (isV6)" not in text:
        text = replace_once(text, anchor, v6_block + anchor, "validation final anchor")
    path.write_text(text, encoding="utf-8")


def patch_site_validation_workflow() -> None:
    path = Path(".github/workflows/site-validation.yml")
    text = path.read_text(encoding="utf-8")
    if "fix/story-ocr-layout-v6-20260816" not in text:
        text = text.replace("      - fix/integrated-tools-v5-20260816\n", "      - fix/integrated-tools-v5-20260816\n      - fix/story-ocr-layout-v6-20260816\n", 1)
    anchor = "              scripts/smoke-integrated-tools-v5.mjs\n"
    addition = (
        anchor
        + "              public/myfile/layout-v6.js\n"
        + "              scripts/smoke-story-layout-v6.mjs\n"
        + "              scripts/smoke-ocr-v6.mjs\n"
    )
    if "scripts/smoke-story-layout-v6.mjs" not in text:
        text = replace_once(text, anchor, addition, "site validation V5 file list")
    if "build-story-snapshot-v6.py" not in text:
        text = text.replace(
            "          python3 -m py_compile scripts/audit-translations-v5.py\n",
            "          python3 -m py_compile scripts/audit-translations-v5.py scripts/build-story-snapshot-v6.py scripts/integrate-story-ocr-layout-v6.py\n",
            1,
        )
    path.write_text(text, encoding="utf-8")


def main() -> int:
    patch_index()
    patch_story()
    patch_attendance()
    patch_runes()
    patch_release_metadata()
    patch_expected_releases()
    patch_validation()
    patch_site_validation_workflow()
    print(RELEASE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
