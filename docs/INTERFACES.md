# 模块接口

所有模块是浏览器原生 ES modules。输入时间为 performance.now() 风格的单调毫秒值；坐标按游戏区域归一化为 0～1。

## 配置与台词

config.js 导出 CONFIG；lines.js 导出 LINES，结构为 { smug, nervous, glitch }，每组是 { id, text } 数组。默认数值见 PLAN.md。

## createGame(config, lines, { onEvent })

game.js 导出 createGame，返回：

| 方法 | 作用 |
| --- | --- |
| press({x,y}, now) | 主输入按下，立即尝试命中 |
| move({x,y}) | 更新持续命中的坐标 |
| release() | 结束按住 |
| tick(now) | 推进阶段与按住计时 |
| setPaused(paused, now) | 暂停/恢复，释放输入，暂停时冻结逻辑时间 |
| getState() | 返回只读快照 |
| dispose() | 清理并停止后续更新 |

快照：phase（active/broken/rebooting）、mood（smug/nervous/glitch）、replacement、combo、totalHits、round、lineId、line。

事件：

- hit：{ type, x, y, combo, intensity }
- phase：{ type, phase }
- line：{ type, lineId, text }

所有状态先提交再向外通知；事件消费者不能在回调中重入修改状态。视图和音频不能控制得分或伤害。

## bindInput(target, game, { now, onGesture })

input.js 导出 bindInput，返回 { dispose }。仅接受主指针与鼠标左键；使用 Pointer Events 与 capture。pointerup、pointercancel、lostpointercapture、blur、隐藏都释放输入。键盘仅在游戏目标聚焦时接受 Space，忽略 key repeat。处理真实用户手势时调用 onGesture，供音频解锁。

## createView(target)

view.js 导出 createView，返回 { render(state), effect(event), setReducedMotion(boolean), dispose() }。

只创建 target 内部节点。render 根据快照更新文字/进度/情绪；effect 处理瞬时反馈。限制临时节点和动画数量。销毁后不保留定时器或动画。

## createAudio()

audio.js 导出 createAudio，返回 { unlock(), play(event), setMuted(boolean), dispose() }。

必须在用户手势中解锁；无 AudioContext、无法恢复或被静音时安全降级。瞬时合成音效不得阻塞玩法。

## 入口与生命周期

app.js 连接各模块，维护声音和动态设置，使用单个 requestAnimationFrame。隐藏和 pagehide 暂停；可见和 pageshow 恢复，支持浏览器往返缓存。重启不重建整页，不重复绑定事件。

首版 localStorage key 为 beat-the-ai.preferences.v1，只保存 muted 和 reducedMotion。存储被禁用时正常游戏。
