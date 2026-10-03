# 魔法纪录 · Magia Exedra 角色称呼与故事搜索

Magia Record Character Call & Story Search — Chinese Enhanced Edition

由 **MADE IN MAGIUS** 维护，基于 [chiki3839](https://github.com/chiki3839) 的 [magireco_character_story_search](https://github.com/chiki3839/magireco_character_story_search) 扩展，提供中文界面、角色与故事检索、可视化及移动端适配。感谢原作者提供的代码、数据整理与工具基础。

**[打开在线工具](https://magireco-call-search-cn.pages.dev/)** · [教程与动态](https://space.bilibili.com/625821) · [下载中心](https://madeinmagius-site.pages.dev/) · [赞助支持 MADE IN MAGIUS](https://afdian.com/a/madeinmagius)

## 功能与入口

| 功能 | 说明 | 在线入口 |
| --- | --- | --- |
| 角色称呼搜索 | 选择角色，查询称呼关系图与表格；支持中文、日文、假名和罗马音筛选，悬停查看角色读音 | [称呼与身高](https://magireco-call-search-cn.pages.dev/) |
| 身高图表 | 已选角色或全局身高图，支持散点图、平均身高柱状图及年龄、学年、学校、组织、属性等分类 | [称呼与身高](https://magireco-call-search-cn.pages.dev/) |
| 角色故事搜索 | 按角色组合、故事类型与关键词检索，查看故事信息及相关跳转入口 | [角色故事搜索](https://magireco-call-search-cn.pages.dev/story.html) |
| 共同出场排行 | 以选定角色为基准，统计其他角色共同出场次数 | [共同出场次数排行](https://magireco-call-search-cn.pages.dev/attendance.html) |
| 魔女文翻译 | 魔女文字转换与图片识别工具 | [魔女文翻译](https://magireco-call-search-cn.pages.dev/runes.html) |
| 标题校对 | 母故事标题清单、下载与管理员校对入口 | [母故事标题翻译清单](https://magireco-call-search-cn.pages.dev/story-title-editor.html) |

- **图片导出**：支持称呼关系图和身高图导出，身高图可导出完整滚动范围。
- **显示设置**：提供多主题、冷辉与夜间外观，以及扫描线、噪点、像素字体、静态辉光等可调效果。iOS 使用原生滚动，屏幕曲率选项在该平台停用。
- **中文本地化**：使用中文显示名、兼容搜索别名与版本化标题数据。翻译与映射仍有人工复核项，不将“已中文化”视为所有内容均已完成审校；详见[翻译与映射审计](docs/translation-audit-v5.md)。

## 作者、二创署名与相关工具

**使用本工具二创，请注明工具作者以及提供工具链接。**

署名示例：`使用工具：MADE IN MAGIUS 制作维护的角色称呼与故事搜索工具 https://magireco-call-search-cn.pages.dev/`

- 工具作者／中文增强版维护：**MADE IN MAGIUS**
- 原项目作者：[chiki3839](https://github.com/chiki3839)
- [魔法纪录 MAGIA EXEDRA 中日双语剧情存档与翻译平台](https://magireader.pages.dev/)
- [magia exedra 魔法纪录 l2d 查看器](https://magiaexedralive2dviewer.pages.dev/)
- [MAGIA EXEDRA 3D 网站](https://magius3dviewer.pages.dev/)
- [赞助支持 MADE IN MAGIUS](https://afdian.com/a/madeinmagius)

## 本地运行

需要 Git、Python 3.12 或更高版本；运行 JavaScript 检查与测试还需要 Node.js，现有导航审查工作流使用 Node.js 22。

```powershell
git clone -c core.autocrlf=false https://github.com/HiiragiNemu/magireco-call-search-cn.git
cd magireco-call-search-cn
python -m http.server 4317 --bind 127.0.0.1 --directory public
```

打开 <http://127.0.0.1:4317/>。从仓库根目录启动，站点文件位于 `public/`；无需先生成前端打包产物。

Python 静态服务器用于预览前端，不执行 `functions/` 中的 Cloudflare Pages Functions。依赖服务端路由的跳转应在相应部署环境验证。

## 维护、检查与部署

- **维护分支**：`main`。
- **生产站点**：<https://magireco-call-search-cn.pages.dev/>，由 Cloudflare Pages 承载。
- **站点目录**：`public/`；Cloudflare Pages Functions 位于 `functions/`。
- **数据更新**：以仓库内版本化静态数据为基础，由维护者核对来源后更新；权威标题数据另提供手动触发的重建工作流。
- **标题校对流程**：见[母故事标题翻译清单说明](docs/story-title-groups-v1.md)。
- **版本回退**：依据 Git 提交和已有部署记录选择已验证版本，不依赖固定名称的旧备份分支。

在仓库根目录可执行以下基础检查；完整步骤以相应工作流为准：

```powershell
python scripts/cn_terminology.py
python scripts/validate-production.py
python scripts/build-aio-edge-route-index.py --check
node scripts/validate-site.js
node --test tests/*.test.mjs
```

| 工作流 | 用途 |
| --- | --- |
| [ci.yml](.github/workflows/ci.yml) | 静态站点、数据一致性及基础回归检查 |
| [production-verify.yml](.github/workflows/production-verify.yml) | 检查生产部署的数据、资源及浏览器回归 |
| [call-navigation-review.yml](.github/workflows/call-navigation-review.yml) | 导航与跨工具跳转审查、候选验证及相关回归 |
| [update-authoritative-titles.yml](.github/workflows/update-authoritative-titles.yml) | 手动重建权威标题数据；有变更时提交到 `main` |

## 上游角色资源与更新方法

### 从哪里获取

原作者 Chiki 的现用站点是 **[magireco-chara-search.vercel.app](https://magireco-chara-search.vercel.app/)**。下面按资源列出入口；文末 `.cf` 地址仅作为原作者历史说明保留，不作为当前更新源。

| 资源 | 上游入口与文件 | 本仓库对应内容 |
| --- | --- | --- |
| 角色称呼关系、年龄、学年、身高、人称 | [称呼原始表格](https://docs.google.com/spreadsheets/d/1V0QTP3YZsoc7h5wOC8oqg7NKJpA6ZPyck9yCYfbJGlk/edit)、[称呼搜索页](https://magireco-chara-search.vercel.app/call.html)、[callTable.js](https://magireco-chara-search.vercel.app/myfile/callTable.js) | `public/myfile/callTable.js` 的 `callTable` 与反向 `calledMap` |
| 角色属性、学校、所属作品与组织标签 | [charaAt.js](https://magireco-chara-search.vercel.app/myfile/charaAt.js) | `public/myfile/charaAt.js`；保留本地年级修正与中文映射 |
| 可选角色名册、日文读音 | [call.html](https://magireco-chara-search.vercel.app/call.html) 的角色输入项及标签 `data-kana`；故事和排行名册分别见上游 `index.html`、`cnt.html` | `public/index.html`、`public/data/character-catalog.json`，以及故事／排行专用角色补充数据 |
| 角色头像 | [charaBox_webp.css](https://magireco-chara-search.vercel.app/myfile/charaBox_webp.css) 内的图片映射，通常指向 `../img/webp/日文角色名.webp` | `public/img/png/` 与 `public/myfile/charaBox_png.css` |
| 故事与出场角色记录 | [故事原始表格](https://docs.google.com/spreadsheets/d/1isucgeJQxlF6EkkzTq9bVJ4xc2WTKDG_K85JGNk6Ihw/edit)、[JSON 发布说明](https://magireco-chara-search.vercel.app/json_open.html)、[完整 JSON 文件](https://drive.google.com/file/d/1kFoEYZ6nJrYQAxGQVwN-SyLg-aPKkH6q/view) | `public/data/story-v6/`；中文标题、本地化与 Reader／AIO 路由另行维护 |

原始代码、表格及 GAS 实现见[上游 GitHub 仓库](https://github.com/chiki3839/magireco_character_story_search)。站点、表格、GitHub 和导出的 JSON 可能更新不同步；每次更新应记录实际来源与获取时间，核对内容差异，而不是仅凭某个版本号认定应覆盖本地。数据使用约定见上游 JSON 发布说明。

### 如何更新而不覆盖现有功能

1. **先核对当前 `main` 与工作区，再取上游样本。** 现有[来源采集脚本](scripts/audit-call-upstream-r24.py)只下载样本并比较名册，不改生产数据。在仓库根目录运行：

   ```powershell
   $review = Join-Path (Get-Location).Path '_sources\upstream-review'
   python -X utf8 scripts/audit-call-upstream-r24.py --output "$review"
   ```

   输出在 Git 忽略的 `_sources/` 中，包含 `report.json`、上游页面／数据脚本、`upstream/story.json` 及当前提交的 `repository.tar.gz`。这不是自动同步，也不另建项目副本。脚本会记录下载失败后继续，须检查报告中的 `error`、`storyParseError`、资源状态和名册差异；成功退出不等于所有来源均已取得。表格原始单元格、头像仍需按上表核对，名字差异先检查已有别名。

2. **逐项审查称呼与角色差异。** 原表格是“行角色称呼列角色”，勿反转方向；年龄／学年／身高／人称不是角色关系边。按日文身份及版本标记匹配，保留中文译名、假名、罗马音、未知值与既有修正，仅合入确认正确的新增或改动。同步检查 `callTable` 与 `calledMap`、属性、选择器、图片映射及共享角色目录；不要整份替换上游 HTML、CSS 或 JavaScript。头像以 CSS 实际地址为准，日文文件名需 URL 编码；若转换为 PNG，应保留原尺寸与透明度。

   [既有来源审计](docs/call-upstream-audit-r24.json)记录了尚待核对的错位称呼、同名／版本属性问题；新上游值也须重新核实。[2026-09-28 更新脚本](scripts/sync-call-data-20260928.py)只重放当时七名角色的固定补丁；`prepare-call-r24.py` 也是固定版本整合脚本，均不是今后的通用更新命令。

3. **确认角色数据改动后重建派生目录。** 下列命令会更新角色目录和翻译审计文件，不会从上游抓取或自动翻译；运行后检查生成差异：

   ```powershell
   python -X utf8 scripts/audit-translations-v5.py
   ```

4. **故事数据单独做候选比较。** 完整 JSON 的下载地址为 [Google Drive 导出链接](https://drive.google.com/uc?export=download&id=1kFoEYZ6nJrYQAxGQVwN-SyLg-aPKkH6q)，采集脚本已使用它。按分类核对标题、出演角色、概要、原文链接及版本组合。需要解析时可用现有构建器生成临时候选，不直接写入 `public/data/story-v6/`：

   ```powershell
   $candidate = Join-Path $review 'story-candidate'
   if (Test-Path -LiteralPath $candidate) { throw '候选目录已存在，请先核对其中内容。' }
   python -X utf8 scripts/build-story-snapshot-v6.py --input "$review\upstream\story.json" --page-html "$review\upstream\index.html" --output "$candidate"
   ```

   构建器会重建指定输出目录，所以仅传入新的临时目录。合入前同时审查行序／来源标识、中文本地化、标题覆盖及 Reader／AIO／Sprite 跳转绑定；条目增加本身不代表集成完成。`update-authoritative-titles.yml` 只负责其既定标题重建，不会同步称呼关系、头像或整套故事数据。

5. **检查、人工验收，再发布。** 执行上文基础检查，核对新增角色的选择、读音、正反向称呼、身高、图片，以及受影响的故事结果和跳转。旧测试中的数量或基线若变化，应依据已审查的新数据更新，不以删断言或放宽检查代替核对。仅提交本次确认的增量，保留既有主题、交互及中文化；记录来源和必要的缓存版本变更，再按正常流程部署。

## 原始项目与致谢

本项目沿用并扩展原作者的工具基础。以下保留原作者说明，其中的旧站地址属于上游历史信息；本中文增强版请使用本文顶部的在线入口。

<details>
<summary>原作者说明（保留原文）</summary>

### magireco_character_story_search

マギレコキャラクタストーリー検索のGAS、データ作成用Googleスプレッドシートと紐付けされたGAS、GUI用HTML+CSSを公開します。
オープンソースソフトとして自由にコピー、改造して使って頂いて構いません。連絡も不要です。
使用例はこちら(index.html)
https://magireco-chara-search.cf/

またキャラ同士の呼びかけ検索のデータ作成用スプレッドシートとGUI用htmlも同時に公開しています。
(cssはストーリー検索と共通)
呼びかけ検索(call.html)はこちら
https://magireco-chara-search.cf/call.html

おまけ（ガチャシミュレーター）(gachasim.html)
https://magireco-chara-search.cf/gachasim.html

</details>
