const assert = require('assert');
const { ROLES, TEAMS, BOARD_PRESETS, validateBoardSettings, getRolePoolFromSettings } = require('./games/werewolf/roles');

console.log('--- 测试 Task 1: 角色扩展与规则板子配置体系 ---');

// 1. 验证解耦的特殊狼人与白痴角色
assert.ok(ROLES.WHITE_WOLF, '应包含白狼王角色');
assert.strictEqual(ROLES.WHITE_WOLF.team, TEAMS.WEREWOLF);
assert.strictEqual(ROLES.WHITE_WOLF.canExplodeWithKill, true);

assert.ok(ROLES.WOLF_KING, '应包含狼王角色');
assert.strictEqual(ROLES.WOLF_KING.team, TEAMS.WEREWOLF);
assert.strictEqual(ROLES.WOLF_KING.canShootOnDeath, true);

assert.ok(ROLES.IDIOT, '应包含白痴角色');
assert.strictEqual(ROLES.IDIOT.team, TEAMS.VILLAGER);
assert.strictEqual(ROLES.IDIOT.canImmuneExile, true);

// 2. 验证预设板子
assert.ok(BOARD_PRESETS['6_SIMPLE'], '应有 6 人板子');
assert.ok(BOARD_PRESETS['9_STANDARD'], '应有 9 人板子');
assert.ok(BOARD_PRESETS['10_STANDARD'], '应有 10 人板子');
assert.ok(BOARD_PRESETS['12_STANDARD'], '应有 12 人预女猎白板子');
assert.strictEqual(BOARD_PRESETS['6_SIMPLE'].length, 6);
assert.strictEqual(BOARD_PRESETS['9_STANDARD'].length, 9);
assert.strictEqual(BOARD_PRESETS['10_STANDARD'].length, 10);
assert.strictEqual(BOARD_PRESETS['12_STANDARD'].length, 12);

// 3. 验证板子卡牌与玩家人数合法性校验
// 3.1 预设板子校验
const validPresetRes = validateBoardSettings({
  mode: 'CLASSIC',
  boardPreset: '9_STANDARD'
}, 9);
assert.strictEqual(validPresetRes.valid, true, '9人预设板子分给9人应成功');
assert.strictEqual(validPresetRes.totalCards, 9);

const invalidCountRes = validateBoardSettings({
  mode: 'CLASSIC',
  boardPreset: '9_STANDARD'
}, 8);
assert.strictEqual(invalidCountRes.valid, false, '9人板子分给8人应校验失败');

// 3.2 自定义板子校验 - 狼人占半数及以上被拒
const illegalWolvesRes = validateBoardSettings({
  mode: 'CLASSIC',
  customRoles: { WEREWOLF: 3, VILLAGER: 2, SEER: 1 }
}, 6);
assert.strictEqual(illegalWolvesRes.valid, false, '6人局3狼占半数必须校验失败');
assert.ok(illegalWolvesRes.error.includes('小于总人数的一半'));

// 3.3 自定义板子校验 - 无平民被拒
const noCivilianRes = validateBoardSettings({
  mode: 'CLASSIC',
  customRoles: { WEREWOLF: 2, SEER: 2, WITCH: 2 }
}, 6);
assert.strictEqual(noCivilianRes.valid, false, '无平民必须校验失败');

// 3.4 自定义板子校验 - 无神职被拒
const noGodRes = validateBoardSettings({
  mode: 'CLASSIC',
  customRoles: { WEREWOLF: 2, VILLAGER: 4 }
}, 6);
assert.strictEqual(noGodRes.valid, false, '无神职必须校验失败');

// 3.5 自定义板子校验 - 合法配置 (包含白狼王与狼王)
const validCustomRes = validateBoardSettings({
  mode: 'CLASSIC',
  customRoles: { WEREWOLF: 2, WHITE_WOLF: 1, VILLAGER: 3, SEER: 1, WITCH: 1, HUNTER: 1 }
}, 9);
assert.strictEqual(validCustomRes.valid, true, '合法9人自定义板子应通过');
assert.strictEqual(validCustomRes.totalCards, 9);

// 4. 验证从设置中生成角色牌堆
const pool = getRolePoolFromSettings({
  mode: 'CLASSIC',
  boardPreset: '9_STANDARD'
}, 9);
assert.strictEqual(pool.length, 9);
assert.ok(pool.includes('SEER'));
assert.ok(pool.includes('WITCH'));
assert.ok(pool.includes('HUNTER'));

console.log('🎉 Task 1 测试用例全部通过！');
