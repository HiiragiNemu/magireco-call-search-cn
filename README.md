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
