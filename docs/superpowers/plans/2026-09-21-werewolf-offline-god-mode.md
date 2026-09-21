# 聚会狼人杀·线下纯手动上帝（法官）模式与主持发言系统实施计划（修订版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为聚会狼人杀构建专为线下聚会设计的“纯手动上帝掌中宝”系统：包含上帝全知控制台、大字主持提词器、完全去除强制倒计时纯手动推进、解耦白狼王与狼王、自定义板子与细节规则（首日警长时序/女巫自救/警长/屠边屠城）、神职阵亡空唤防泄密、平票PK状态机、警徽强制流转弹窗、Screen Wake Lock 常亮与一键防窥暗屏玩家端。

**Architecture:** 
- 后端扩展 `games/werewolf/roles.js` 和 `games/werewolf/server.js`，增加角色（白狼王、狼王、白痴）、板子预设与强防呆规则校验；实现上帝全知数据隔离、夜间上一步撤销回退、神职空唤防泄密、警长双时序分支、平票 PK、警徽流转阻断与强制终局；
- 前端在 `public/werewolf/` 构建上帝控制台（Screen Wake Lock 保活、OLED 纯黑高对比、全知座次大盘、大字台词提词卡、纯手动按键与 ⏪上一步、裁判特权区）以及普通玩家极暗防窥卡片界面（localStorage 静默重连握手与手势防呆提醒）；
- 端到端通过 `test_werewolf_god_mode.js` 进行覆盖 10 项严苛用例的 Socket.io 自动化验证。

**Tech Stack:** Node.js, Express, Socket.io, Vanilla JavaScript, HTML5/CSS3, Screen Wake Lock API.

**Spec:** `docs/superpowers/specs/2026-09-21-werewolf-offline-god-mode-design.md`

## Global Constraints
- 绝无自动倒计时（No forced timers）：夜晚与白天步骤 100% 由上帝手动点击触发；
- 绝无自动语音播报与前端音效震动（No TTS / audio narration / vibration）：纯大字提词卡视觉辅助，严防声响场外泄密；
- 上帝不计入游戏卡位（`isGodMode: true`, `isSpectator: true`），普通玩家开局前与对局中严格隔离他人身份数据；
- 严格遵循 TDD：每个后端 Task 均需有对应的自动化测试先行或同步验证。

---

### Task 1: 角色扩展、解耦狼人与板子合法性校验 (`games/werewolf/roles.js`)

**Files:**
- Modify: `games/werewolf/roles.js`
- Test: `test_werewolf_rules_config.js`

**Interfaces:**
- Consumes: 现有 `ROLES`, `TEAMS`
- Produces: 
  - `ROLES.WHITE_WOLF`（白狼王：自爆带走 1 人并直接强制入夜）
  - `ROLES.WOLF_KING`（狼王/枪狼：出局开枪带人，被女巫毒杀不可开枪，逻辑同猎人）
  - `ROLES.IDIOT`（白痴：白天被公投出局翻牌免死，保留发言权失去投票权）
  - `BOARD_PRESETS`: `{ '6_SIMPLE', '9_STANDARD', '10_STANDARD', '12_STANDARD' }`
  - `validateBoardSettings(settings, playerCount)`: 包含狼人占比小于半数、民神各至少 1 人、卡牌严格等于人数的合法性校验
  - 细节规则项：`firstDaySheriffTiming`（`BEFORE_DEATH_ANNOUNCE` | `AFTER_DEATH_ANNOUNCE`）

- [ ] **Step 1: 编写/更新测试用例 `test_werewolf_rules_config.js`**
- [ ] **Step 2: 运行测试验证失败**
- [ ] **Step 3: 在 `games/werewolf/roles.js` 中实现角色解耦与防呆校验**
- [ ] **Step 4: 再次运行测试验证通过**
- [ ] **Step 5: 提交更改**

---

### Task 2: 上帝模式房间初始化与断线持久化脱敏 (`games/werewolf/server.js`)

**Files:**
- Modify: `games/werewolf/server.js`
- Test: `test_werewolf_god_mode.js` (构建第一部分基础用例)

**Interfaces:**
- Consumes: `BOARD_PRESETS`, `validateBoardSettings`
- Produces:
  - `room.settings.isGodMode`: boolean
  - `room.settings.firstDaySheriffTiming`: 'BEFORE_DEATH_ANNOUNCE' | 'AFTER_DEATH_ANNOUNCE'
  - `getSafeRoomData(room, targetPlayerId)`: 上帝获得全知数据；普通玩家获得脱敏数据并分配 1~N 座位号
  - `reconnect_room`: 依据 `playerId` 与 `roomCode` 毫秒级静默恢复连接与底牌状态

- [ ] **Step 1: 编写 `test_werewolf_god_mode.js` 用例 1 与用例 2**
- [ ] **Step 2: 运行测试验证失败**
- [ ] **Step 3: 修改 `games/werewolf/server.js`**
- [ ] **Step 4: 运行测试验证通过**
- [ ] **Step 5: 提交更改**

---

### Task 3: 夜间零倒计时纯手动推进、空唤防泄密与上一步撤回 (`games/werewolf/server.js`)

**Files:**
- Modify: `games/werewolf/server.js`
- Test: `test_werewolf_god_mode.js`

**Interfaces:**
- Consumes: `room.gameState.nightRecord`, `room.gameState.stepHistory`
- Produces:
  - `god_night_step`: 守卫 ➔ 狼刀 ➔ 女巫 ➔ 预言家纯手动推进；
  - `isDeadFakeCall`: 若当前神职已阵亡，依然下发提词，并携带 `isDeadFakeCall: true` 供上帝端提示空唤防泄密；
  - `god_night_prev_step`: **【⏪ 上一步】** 回退夜间步骤并还原历史快照；
  - `god_announce_dawn`: 自动结算死伤（解药免死、奶穿、双死、猎人可开枪、狼王可开枪）。

- [ ] **Step 1: 在 `test_werewolf_god_mode.js` 中编写用例 3、4、5**
- [ ] **Step 2: 运行测试验证失败**
- [ ] **Step 3: 在 `games/werewolf/server.js` 中实现空唤机制、撤销栈与夜间引擎**
- [ ] **Step 4: 运行测试验证通过**
- [ ] **Step 5: 提交更改**

---

### Task 4: 白天流程、警长时序分支、平票 PK、警徽流转与胜负判定 (`games/werewolf/server.js`)

**Files:**
- Modify: `games/werewolf/server.js`
- Test: `test_werewolf_god_mode.js`

**Interfaces:**
- Consumes: `deadListTonight`, `firstDaySheriffTiming`, `winCondition`
- Produces:
  - 动态状态分支：`firstDaySheriffTiming` 驱动先竞选后报死或先报死后竞选；
  - `god_trigger_pk` / `god_peace_day`: 平票 PK 状态流转（`DAY_PK_DISCUSS` ➔ `DAY_PK_VOTE` ➔ `DAY_PEACE_DAY` 平安日）；
  - `god_transfer_badge`: 警长出局触发强制移交或撕徽；
  - `god_wolf_explode`: 支持普通狼自爆、白狼王自爆带人入夜、狼王自爆（不可开枪）；
  - `god_vote_execute`: 白痴翻牌免死判定与猎人/狼王出局开枪；
  - `checkGameWinner`: 屠边、屠城与同归于尽平局判定；
  - `god_force_end`: 裁判强制终局特权。

- [ ] **Step 1: 在 `test_werewolf_god_mode.js` 中编写用例 6~10**
- [ ] **Step 2: 运行测试验证失败**
- [ ] **Step 3: 在 `games/werewolf/server.js` 中实现白天完整状态流转**
- [ ] **Step 4: 运行测试验证通过**
- [ ] **Step 5: 提交更改**

---

### Task 5: 上帝总控台、Screen Wake Lock、大字提词器与防窥暗屏界面 (`public/werewolf/`)

**Files:**
- Modify: `public/werewolf/index.html`
- Modify: `public/werewolf/style.css`
- Modify: `public/werewolf/client.js`

**Interfaces:**
- Consumes: Task 1~4 中实现的服务端 Socket 事件与数据流
- Produces:
  - `navigator.wakeLock.request('screen')` 屏幕常亮与唤醒重新申请；
  - OLED 纯黑 `#000000` 高对比深色主题，全平台移除音效与振动；
  - 大字提词器卡片：空唤时显示醒目黄色/红色警告 `⚠️ 该角色已阵亡，请照常念白并默数...`；
  - 控制台顶部增设醒目的【⏪ 上一步】按钮；
  - 警长阵亡时的【移交警徽 / 撕毁警徽】强制模态阻断弹窗；
  - 平票 PK 控制面板（勾选平票玩家、进入 PK 发言、二次投票）；
  - 玩家端防窥模式与黄色警示文案：“⚠️ 本局为线下纯手势对决，看牌后请扣下手机，夜间行动全凭法官口令举手示意”。

- [ ] **Step 1: 扩展 `public/werewolf/index.html`**
- [ ] **Step 2: 在 `public/werewolf/style.css` 中添加样式**
- [ ] **Step 3: 在 `public/werewolf/client.js` 中编写前端事件与逻辑**
- [ ] **Step 4: 本地构建与静态资源验证**
- [ ] **Step 5: 提交更改**

---

### Task 6: 完整端到端自动化测试套件与全绿验证

**Files:**
- Modify/Extend: `test_werewolf_god_mode.js`

**Interfaces:**
- Consumes: 全套服务端与前端协议
- Produces: 10 组核心用例完整验证通过报告

- [ ] **Step 1: 整合完整测试脚本 `test_werewolf_god_mode.js`**
- [ ] **Step 2: 运行完整自动化测试并确保全绿**
- [ ] **Step 3: 提交更改**
