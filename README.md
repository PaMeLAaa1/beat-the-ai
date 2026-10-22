# 暴打 AI

**听说，你想替代我？**

一个打开就能玩的解压小游戏：面对声称能取代你的 AI，点击或按住攻击，把「取代人类计划」打到 0%，让它请求人工帮助。

## 玩法

- 点击立即出拳，按住持续攻击；键盘聚焦游戏区域后也可按住空格。
- AI 从嘴硬、慌张到乱码，打爆后自动重启；重新按下即可再打一轮。
- 可静音、减弱动态；首次访问会尊重系统减弱动态偏好。
- 没有账号、真实 AI 接口、付费、排行榜或失败惩罚。

## 本地运行

需要 Node.js 20 或更新版本，不需要安装依赖。

```sh
git clone https://github.com/PaMeLAaa1/beat-the-ai.git
cd beat-the-ai
npm start
```

打开 http://127.0.0.1:3000 。通过云环境端口预览时使用 `HOST=0.0.0.0 npm start`。

```sh
npm run check
npm test
```

`dist/` 同时是手写源码和静态站点产物，无需打包。通过 HTTP 服务访问，不能直接双击 HTML 使用 ES modules。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `dist/app.js` | 初始化、设置、页面生命周期 |
| `dist/game.js` | 状态、伤害、连击、重启时序 |
| `dist/input.js` | 指针与键盘输入 |
| `dist/view.js`、`dist/styles.css` | 原创 AI、布局与特效 |
| `dist/audio.js` | Web Audio 合成音效 |
| `dist/config.js`、`dist/lines.js` | 数值和台词 |
| `tests/` | Node 内置测试 |

## 开发与交接

[工作约定](AGENTS.md) · [实施计划](docs/PLAN.md) · [Agent 分工](docs/AGENT_ASSIGNMENTS.md) · [接口](docs/INTERFACES.md) · [验收](docs/ACCEPTANCE.md) · [交接状态](docs/HANDOFF.md)

## 部署与隐私

将 `dist/` 部署到支持静态文件的托管服务即可。仓库的 GitHub Actions 只运行验证，不自动发布网站；尚未提供已验证的线上试玩地址。

无分析、广告或后端调用，只在浏览器 localStorage 保存声音和动态偏好。原创 SVG、系统字体与合成音效无需外部资源。角色是虚构 AI，进度条是游戏数值，不是对就业风险的预测。

## 许可证

[MIT](LICENSE)
