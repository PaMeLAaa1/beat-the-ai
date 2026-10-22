# 交接状态

## 当前代码

项目：[PaMeLAaa1/beat-the-ai](https://github.com/PaMeLAaa1/beat-the-ai)。首版实现与合并记录：[PR #1](https://github.com/PaMeLAaa1/beat-the-ai/pull/1)。PR 合并后使用 main；如 PR 仍显示 Open，请先切换 feat/playable-v1。

已提交完整 25 个项目文件：静态游戏、原创 SVG AI、音效、输入与玩法模块、23 个测试、服务器、检查脚本、CI 和开发文档。点击或按住攻击，将「取代人类计划」从 100% 打到 0%，自动重启后重新按下可再玩。

没有真实 AI 接口，不需要密钥、数据库或依赖安装。不要因为是「AI 游戏」而添加 LLM 调用。

## 已执行验证

2026-10-22，游戏源码提交 `73ed905b274080d8057502b5fa54ea5625e149bf` 在 [GitHub Actions 第 1 次运行](https://github.com/PaMeLAaa1/beat-the-ai/actions/runs/39732723269) 实际通过：

- Node.js 20 与 22：`npm run check`，JavaScript 语法和本地资源引用检查。
- Node.js 20 与 22：`npm test`，各 22 个用例全部通过，失败 0。
- Node.js 20 与 22：HTTP 服务返回 HTML、JS、CSS。
- Node.js 22 + headless Chrome：首次加载、真实鼠标点击、Space、按住到打爆、自动重启后不自动攻击、设置不触发攻击、偏好刷新后保留、390px 无横向溢出，以及无未捕获浏览器异常。

Chrome 检查脚本为 `scripts/browser-smoke.mjs`，需要 Node.js 22+ 和本机 Chrome（默认 `google-chrome`，可用 `BROWSER` 指定路径）。它生成桌面、人工接管、390px 手机视口截图。第 1 次运行的上传步骤忽略了隐藏目录，未上传截图；后续 CI 配置已修正为显式上传 `.artifacts/*.png`，截图以对应成功运行的 `browser-screenshots` artifact 为准。

此前 V8 适配检查只是辅助，不计入上述实际 Node/Chrome 验证。输入单元测试中的 DOM 是模拟对象；Chrome 检查另行使用真实浏览器输入事件。

## 第二轮浏览器试玩与修复

2026-10-22，用户要求再次试玩。首次扩展检查在真实 Chrome 中复现：按住 Space 后将焦点移到设置按钮，攻击仍然继续。输入模块现已在游戏区域失焦时释放键盘和指针按住状态，并增加回归测试。变更记录：[PR #2](https://github.com/PaMeLAaa1/beat-the-ai/pull/2)。

修复提交 `53d15f53ac0cdd07e279ac74d3b2e27110c2de14` 的 [完整试玩运行](https://github.com/PaMeLAaa1/beat-the-ai/actions/runs/39741565413) 全部通过：

- Node.js 20/22 各 23 个单元测试通过。
- Chrome 真实键盘事件确认：Space 按住后焦点移走，攻击立即停止。
- CDP 触摸模拟：首触攻击，第二触点不额外计分，touchCancel、拖出区域后松手均停止连击。
- 新开标签并实际观察到 document.hidden 后返回，确认不补打、不继续按住攻击。
- 普通动态、开启音效配置下连续运行约 122 秒，共 29 轮、725 拳；临时特效节点峰值 30（上限 36），结束后归零，无未捕获浏览器异常。没有实际聆听音频。
- 人工查看 Chrome 截图：桌面、320×568、390×844 与人工接管画面。320/360/390px 自动布局检查均通过，核心 AI 和进度在首屏，设置按钮触控区域至少 44px。

测试 runner 原先缺中文字体，导致截图出现方框；CI 安装 fonts-noto-cjk 后重新截图，中文显示正常。网站本身仍只使用系统字体，没有新增外部字体请求。

长跑使用 `PLAYTEST_DURATION_MS=120000 node scripts/browser-smoke.mjs`。常规 CI 保留新增的交互和小屏检查；两分钟长跑按需启用。截图仍作为 `browser-screenshots` artifact 保存。CDP 触摸模拟不等同于手机实机测试。

## 尚未完成

- 手机实机触摸手感、iOS Safari、Firefox、音频听感和持续操作 2 分钟的人工验收，见 [ACCEPTANCE.md](ACCEPTANCE.md)。
- 云开发环境启动：当前会话报告 executor configuration capabilities 查询失败。GitHub 连接和代码提交正常，CI 在 GitHub runner 上运行成功；这不代表本会话云环境已修好。
- 线上部署：尚无已验证的试玩地址，GitHub Actions 当前只验证，不发布站点。开源仓库与网站访问范围分别管理。

## 云环境设置

1. 选择仓库 PaMeLAaa1/beat-the-ai 的 main 分支（确认 PR #1 已合并）。
2. 使用 Node.js 22 或更新版本；代码也已在 Node.js 20 验证。
3. 不需要 npm install；确认 node 与 npm 可用。
4. `npm run check` 检查语法/引用；`npm test` 执行逻辑和输入测试。
5. `HOST=0.0.0.0 npm start` 启动云端端口预览，默认端口 3000；本地默认监听 127.0.0.1。

仓库已包含提交、main 分支和可运行源码。若平台仍提示空仓库，确认选择了正确的仓库、分支和最新提交；不要因此重新申请 GitHub OAuth 权限。

## 后续工作

完成人工试玩后调整打击手感，再部署 `dist/`。首版先保持一个角色和一个循环，不扩展职业关卡、排行榜或商业化。

如继续使用 Sites，按可用的 Sites 工作流生成并保存 hosting 配置。不要使用猜测的 project ID、commit SHA 或 URL；发布成功前不标记已上线。
