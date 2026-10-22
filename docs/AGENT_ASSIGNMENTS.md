# Agent 分工

核心开发采用 3 个角色，避免多人同时编辑同一文件。

| 角色 | 负责范围 | 交付文件 |
| --- | --- | --- |
| A：协调与集成 | 产品范围、入口、设置、生命周期、启动脚本、文档、GitHub 和交付 | README.md、AGENTS.md、docs/、package.json、LICENSE、dist/index.html、dist/app.js、scripts/、.github/ |
| B：视觉与音效 | AI 原创形象、布局、表情、打击特效、音频、动态降级 | dist/view.js、dist/styles.css、dist/audio.js |
| C：玩法与输入 | 纯状态机、节流、连击、按住、暂停与重启、指针与键盘、测试 | dist/config.js、dist/lines.js、dist/game.js、dist/input.js、tests/ |

## 并行规则

A 先明确 docs/INTERFACES.md。B 与 C 按该接口并行；A 同时做入口和文档。模块不能跨职责互相写状态。

B 的事件消费方式不能影响 C 的时序。C 不依赖 DOM 或音频；input.js 是 DOM 适配层。A 负责用户设置和页面隐藏/恢复。

在云端文件系统不可用时，允许 B/C 将各自完整文件创建为 GitHub blob 并返回 SHA；由 A 统一建 tree 和 commit。单纯创建 blob 不等于文件已经出现在分支上。

## 每个角色的完成条件

- A：入口引用完整，设置不攻击，页面恢复无额外循环，运行命令和验证状态准确。
- B：首击有反馈，三种情绪可辨；特效/声部有上限，静音与减弱动态生效；仅负责自身节点。
- C：固定时钟可测试；一次输入一次即时命中；取消/离开清理按住；重启需重新按下；状态快照不可变。

报告必须区分「实现」「静态检查」「V8 执行」「Node 执行」「浏览器实测」「部署」。未经实际执行不勾选验收项。
