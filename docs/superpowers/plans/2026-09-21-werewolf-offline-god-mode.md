# 聚会狼人杀·线下纯手动上帝（法官）模式与主持发言系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为聚会狼人杀构建专为线下聚会设计的“纯手动上帝掌中宝”系统：包含上帝全知控制台、大字主持提词器、完全去除强制倒计时纯手动推进、自定义板子与细节规则（女巫自救/警长/屠边屠城）、自动防呆死伤结算与一键防窥暗屏玩家端。

**Architecture:** 
- 后端扩展 `games/werewolf/roles.js` 和 `games/werewolf/server.js`，增加角色（白狼王、白痴）、板子预设与规则校验；实现上帝全知数据隔离与零倒计时夜晚/白天状态机；
- 前端在 `public/werewolf/` 构建上帝控制台（全知座次大盘、大字台词提词卡、纯手动按键、裁判特权区）以及普通玩家极暗防窥卡片界面；
- 端到端通过新建的 `test_werewolf_god_mode.js` 进行全流程 Socket.io 自动化验证。

**Tech Stack:** Node.js, Express, Socket.io, Vanilla JavaScript, HTML5/CSS3.

**Spec:** `docs/superpowers/specs/2026-09-21-werewolf-offline-god-mode-design.md`

## Global Constraints
- 绝无自动倒计时（No forced timers）：夜晚与白天步骤 100% 由上帝手动点击触发；
- 绝无自动语音播报（No TTS / audio narration）：通过视觉大字提词卡展示标准念白台词给法官朗读；
- 上帝不计入游戏卡位（`isGodMode: true`, `isSpectator: true`），普通玩家开局前与对局中严格隔离他人身份数据；
- 严格遵循 TDD：每个后端 Task 均需有对应的自动化测试先行或同步验证。

---

### Task 1: 角色扩展与规则板子配置体系 (`games/werewolf/roles.js`)

**Files:**
- Modify: `games/werewolf/roles.js`
- Test: `test_werewolf_rules_config.js`

**Interfaces:**
- Consumes: 现有 `ROLES`, `TEAMS`
- Produces: 
  - `ROLES.WHITE_WOLF` (白狼王/狼王)
  - `ROLES.IDIOT` (白痴)
  - `BOARD_PRESETS`: `{ '6_SIMPLE', '9_STANDARD', '10_STANDARD', '12_STANDARD' }`
  - `validateBoardSettings(settings, playerCount)`: 返回 `{ valid: boolean, error?: string, totalCards: number }`

- [ ] **Step 1: 编写测试用例 `test_werewolf_rules_config.js`**

```javascript
const assert = require('assert');
const { ROLES, BOARD_PRESETS, validateBoardSettings } = require('./games/werewolf/roles');

console.log('--- 测试 Task 1: 角色扩展与规则板子配置 ---');

// 1. 验证新角色
assert.ok(ROLES.WHITE_WOLF, '应包含白狼王角色');
assert.strictEqual(ROLES.WHITE_WOLF.team, 'WEREWOLF');
assert.ok(ROLES.IDIOT, '应包含白痴角色');
assert.strictEqual(ROLES.IDIOT.team, 'VILLAGER');

// 2. 验证预设板子
assert.ok(BOARD_PRESETS['6_SIMPLE'], '应有 6 人板子');
assert.ok(BOARD_PRESETS['9_STANDARD'], '应有 9 人板子');
assert.ok(BOARD_PRESETS['10_STANDARD'], '应有 10 人板子');
assert.ok(BOARD_PRESETS['12_STANDARD'], '应有 12 人板子');
assert.strictEqual(BOARD_PRESETS['9_STANDARD'].length, 9);
assert.strictEqual(BOARD_PRESETS['12_STANDARD'].length, 12);

// 3. 验证板子卡牌与玩家人数校验
const validRes = validateBoardSettings({
  mode: 'CLASSIC',
  boardPreset: '9_STANDARD',
  customRoles: null
}, 9);
assert.strictEqual(validRes.valid, true);

const invalidRes = validateBoardSettings({
  mode: 'CLASSIC',
  boardPreset: '9_STANDARD',
  customRoles: null
}, 8);
assert.strictEqual(invalidRes.valid, false, '9人板子分给8人应校验失败');

console.log('✅ Task 1 测试用例全部通过！');
```

- [ ] **Step 2: 运行测试验证失败**

运行: `node test_werewolf_rules_config.js`
预期: 抛出错误（`BOARD_PRESETS is not defined` 或 `WHITE_WOLF is not defined`）

- [ ] **Step 3: 在 `games/werewolf/roles.js` 中实现新角色与板子配置**

在 `ROLES` 中补充 `WHITE_WOLF` 和 `IDIOT`；定义 `BOARD_PRESETS`；实现 `validateBoardSettings` 并导出。

- [ ] **Step 4: 再次运行测试验证通过**

运行: `node test_werewolf_rules_config.js`
预期: 输出 `✅ Task 1 测试用例全部通过！`，退出码 0。

- [ ] **Step 5: 提交更改**

```bash
git add games/werewolf/roles.js test_werewolf_rules_config.js
git commit -m "feat(werewolf): add white wolf, idiot roles and board presets validation"
```

---

### Task 2: 上帝模式房间初始化与全知视角脱敏 (`games/werewolf/server.js`)

**Files:**
- Modify: `games/werewolf/server.js`
- Test: `test_werewolf_god_mode.js` (创建基础版测试套件)

**Interfaces:**
- Consumes: `BOARD_PRESETS`, `validateBoardSettings`
- Produces:
  - `room.settings.isGodMode`: boolean
  - `room.settings.boardPreset`: string
  - `room.settings.witchSelfSave`: 'FIRST_NIGHT_ONLY' | 'NEVER' | 'ALWAYS'
  - `room.settings.witchDoublePotion`: boolean
  - `room.settings.guardWitchConflict`: 'DIE' | 'SURVIVE'
  - `room.settings.hasSheriff`: boolean
  - `room.settings.winCondition`: 'KILL_SIDE' | 'KILL_ALL'
  - `room.settings.lastWordsRule`: string
  - `getSafeRoomData(room, targetPlayerId)`: 上帝获得全知数据；参战玩家获得分配的 1~N 座位号与自身脱敏底牌。

- [ ] **Step 1: 编写 `test_werewolf_god_mode.js` 中的测试 1 与测试 2**

测试创建开启 `isGodMode` 的房间、规则设置同步、以及玩家入房发牌后上帝与普通玩家的数据隔离。

- [ ] **Step 2: 运行测试验证失败**

运行: `node test_werewolf_god_mode.js`
预期: 失败，当前 server.js 尚不支持 `isGodMode`。

- [ ] **Step 3: 修改 `games/werewolf/server.js`**

1. 在 `createRoom` 与 `update_settings` 中支持 `isGodMode` 及各项新规则字段；
2. 在 `startGame` 中：若开启上帝模式，`playingPlayers = players.filter(p => p.id !== room.hostId)`，房主标记为 `isGod: true, isSpectator: true`，仅对 `playingPlayers` 洗牌发牌并分配座位号（1~N）；
3. 在 `getSafeRoomData` 中：当 `targetPlayerId === room.hostId && room.settings.isGodMode` 时，下发所有玩家的 `seatNumber`, `initialRole`, `currentRole`, `isAlive`；对普通玩家，他人的角色严格返回 `null`。

- [ ] **Step 4: 运行测试验证通过**

运行: `node test_werewolf_god_mode.js`
预期: 房间创建、座位号分配与上帝全知视角测试通过。

- [ ] **Step 5: 提交更改**

```bash
git add games/werewolf/server.js test_werewolf_god_mode.js
git commit -m "feat(werewolf): implement god mode room initialization and omniscient data isolation"
```

---

### Task 3: 夜间零倒计时纯手动推进与自动防呆死伤结算 (`games/werewolf/server.js`)

**Files:**
- Modify: `games/werewolf/server.js`
- Test: `test_werewolf_god_mode.js`

**Interfaces:**
- Consumes: `room.gameState.nightRecord`
- Produces:
  - Socket 事件处理：`god_night_step`（支持参数 `{ roomCode, step, actionData }`）
    - `step: 'GUARD'`：记录守护目标（校验防连守），更新台词为狼人睁眼；
    - `step: 'WEREWOLF'`：记录击杀目标，更新台词为女巫睁眼；
    - `step: 'WITCH'`：记录解药（校验自救规则）/毒药，更新台词为预言家睁眼；
    - `step: 'SEER'`：查验目标，返回 `{ isWolf: boolean, roleName: string }`，更新天亮台词；
  - Socket 事件处理：`god_announce_dawn`（触发自动结算并进入白天死讯公告）：
    - 自动计算奶穿、解药免死、毒死双死、猎人可开枪资格标记；
    - 生成动态战报大字提词（平安夜 / [X号] 出局 / 双死）。

- [ ] **Step 1: 在 `test_werewolf_god_mode.js` 中编写夜间全流程测试用例**

模拟上帝手动推进夜晚各步骤：守卫 ➔ 狼人 ➔ 女巫 ➔ 预言家查验反馈 ➔ 天亮死讯与猎人可开枪判定。

- [ ] **Step 2: 运行测试验证失败**

运行: `node test_werewolf_god_mode.js`
预期: 失败（未定义 `god_night_step` 等事件）。

- [ ] **Step 3: 在 `games/werewolf/server.js` 中实现夜间纯手动状态机与结算引擎**

1. 建立阶段台词库生成函数 `getScriptForPhase(room, phase, extraData)`；
2. 实现 `god_night_step` 事件监听器，处理守卫、狼人、女巫（含自救校验）、预言家操作与即时验人反馈；
3. 实现 `resolveNightDeaths(room)` 结算函数并由 `god_announce_dawn` 触发，更新 `deadTonight` 与猎人状态。

- [ ] **Step 4: 运行测试验证通过**

运行: `node test_werewolf_god_mode.js`
预期: 夜晚手动推进与结算防呆测试绿灯通过。

- [ ] **Step 5: 提交更改**

```bash
git add games/werewolf/server.js test_werewolf_god_mode.js
git commit -m "feat(werewolf): implement manual night state machine, prompter scripts, and death resolution"
```

---

### Task 4: 白天流程、警长竞选、公投放逐与胜负判定 (`games/werewolf/server.js`)

**Files:**
- Modify: `games/werewolf/server.js`
- Test: `test_werewolf_god_mode.js`

**Interfaces:**
- Consumes: `deadTonight`, `room.settings.hasSheriff`, `room.settings.winCondition`
- Produces:
  - Socket 事件：`god_sheriff_action`（参选/退水/授徽 `sheriffPlayerId`）
  - Socket 事件：`god_select_speaker`（标记当前发言人，更新台词）
  - Socket 事件：`god_wolf_explode`（狼人自爆，直接跳过白天入夜）
  - Socket 事件：`god_vote_execute`（录入公投出局者，白痴免死判定）
  - `checkGameWinner(room)`：支持屠边（`KILL_SIDE`）与屠城（`KILL_ALL`）自动胜负判定。

- [ ] **Step 1: 在 `test_werewolf_god_mode.js` 中编写白天流程与胜负测试用例**

模拟：警长竞选当选、白天发言人标记、狼人自爆入夜、公投出局、胜负条件触发（屠边胜利）。

- [ ] **Step 2: 运行测试验证失败**

运行: `node test_werewolf_god_mode.js`
预期: 失败（缺少白天上帝事件处理）。

- [ ] **Step 3: 在 `games/werewolf/server.js` 中实现白天事件与胜负检测**

1. 实现 `god_sheriff_action`（支持授徽、移交、撕警徽）；
2. 实现 `god_select_speaker`；
3. 实现 `god_wolf_explode`；
4. 实现 `god_vote_execute`（包含白痴翻牌免死判定与猎人开枪带人）；
5. 实现 `checkGameWinner` 屠边与屠城算法，胜负达成时标记 `winnerTeam` 并生成终局台词。

- [ ] **Step 4: 运行测试验证通过**

运行: `node test_werewolf_god_mode.js`
预期: 白天流程与胜负判定测试全部通过。

- [ ] **Step 5: 提交更改**

```bash
git add games/werewolf/server.js test_werewolf_god_mode.js
git commit -m "feat(werewolf): implement daytime flow, sheriff election, voting execution, and win conditions"
```

---

### Task 5: 上帝总控台、大字提词器与玩家防窥界面 (`public/werewolf/`)

**Files:**
- Modify: `public/werewolf/index.html`
- Modify: `public/werewolf/style.css`
- Modify: `public/werewolf/client.js`

**Interfaces:**
- Consumes: Task 1~4 中实现的服务端 Socket 事件与数据流
- Produces:
  - 房间大厅：上帝模式勾选框、预设板子下拉菜单、规则开关弹窗；
  - 上帝端全知大盘：顶部大字高亮提词卡片、1~N 座位卡片矩阵（身份、存活、警徽、技能标）、纯手动操作面板（点选目标、下一步、天亮结算、公投、自爆）；
  - 普通玩家端：高清身份底牌与【一键扣牌/极暗防窥模式】（触控唤醒）。

- [ ] **Step 1: 扩展 `public/werewolf/index.html`**

增加上帝模式开关、规则设置弹窗容器、上帝全知控制台主容器（包含大字提词器 `#godPrompterCard`、操作区 `#godActionPanel`、裁判特权区）、以及玩家端防窥暗屏遮罩 `#privacyCoverOverlay`。

- [ ] **Step 2: 在 `public/werewolf/style.css` 中添加样式**

大字提词卡样式（清晰醒目，字体 22px+，深色护眼背景）、座位卡牌高亮样式、暗屏防窥遮罩样式。

- [ ] **Step 3: 在 `public/werewolf/client.js` 中绑定上帝端与玩家端逻辑**

1. 渲染规则配置选项与保存同步；
2. 依据 `isGod` 渲染上帝总控台或玩家看牌端；
3. 绑定各夜晚步骤点击事件发送 `god_night_step`、天亮发送 `god_announce_dawn`、投票发送 `god_vote_execute`；
4. 绑定玩家端“扣下卡牌”防窥开关；
5. 绑定自爆与裁判特权事件。

- [ ] **Step 4: 本地构建与静态资源验证**

运行服务并在浏览器或模拟脚本中验证无控制台语法错误。

- [ ] **Step 5: 提交更改**

```bash
git add public/werewolf/index.html public/werewolf/style.css public/werewolf/client.js
git commit -m "feat(werewolf): build god console UI with large prompter card and privacy dark mode"
```

---

### Task 6: 完整端到端自动化测试与系统集成

**Files:**
- Modify/Extend: `test_werewolf_god_mode.js`

**Interfaces:**
- Consumes: 全套服务端与协议
- Produces:
  - 8 项核心用例完整验证通过报告

- [ ] **Step 1: 整合完整测试脚本 `test_werewolf_god_mode.js`**

包含：
1. 开启上帝模式与设置 10 人预女猎守板子、屠边、首夜自救、有警长；
2. 10 名玩家入座 1~10 号，验证上帝全知数据与普通玩家脱敏；
3. 夜晚纯手动推进（守卫 ➔ 狼人 ➔ 女巫 ➔ 预言家查验反馈）；
4. 天亮自动结算死讯生成（平安夜/双死/猎人可开枪）；
5. 警长竞选当选与白天发言；
6. 狼人自爆直接入夜；
7. 白天公投放逐与屠边胜负结算；
8. 掉线重连状态毫秒级无损还原。

- [ ] **Step 2: 运行完整自动化测试**

运行: `node test_werewolf_god_mode.js`
预期: 全部 8 项用例绿灯通过，打印 `🎉 狼人杀线下上帝模式全部用例验证通过！`。

- [ ] **Step 3: 提交更改**

```bash
git add test_werewolf_god_mode.js
git commit -m "test(werewolf): add end-to-end integration test suite for offline god mode"
```
