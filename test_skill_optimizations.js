const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 开始测试 4 款聚会游戏 Agent Skills 优化项 (Audio Design, Game Feel, Performance, UI/UX)...');

const targetGames = ['undercover', 'trapwords', 'werewolf', 'spyfall'];

// 1. 验证目标游戏 CSS 优化项规范
targetGames.forEach(game => {
  const cssPath = path.join(__dirname, 'public', game, 'style.css');
  assert(fs.existsSync(cssPath), `[${game}] style.css 必须存在`);
  const css = fs.readFileSync(cssPath, 'utf8');

  // Game Feel
  assert(css.includes('screenShake'), `[${game}] 必须包含 screenShake 屏幕震颤关键帧`);
  assert(css.includes('.screen-shake'), `[${game}] 必须包含 .screen-shake 动效类`);
  assert(css.includes('elasticPop'), `[${game}] 必须包含 elasticPop 弹性展开动画`);

  // Performance Optimization
  assert(css.includes('will-change: transform'), `[${game}] 必须应用 will-change: transform 硬件加速`);
  assert(css.includes('translateZ(0)'), `[${game}] 必须应用 translateZ(0) 独立 GPU 合成图层`);
  assert(css.includes('touch-action: manipulation'), `[${game}] 必须配置 touch-action: manipulation 消除移动端点击延迟`);

  // Game UI/UX
  assert(css.includes('safe-area-inset-bottom'), `[${game}] 必须配置 safe-area-inset-bottom 移动端全面屏安全区适配`);

  console.log(`  ✓ [${game}] CSS 样式规范验证通过 (Game Feel + Performance + UI/UX)`);
});

// 2. 验证目标游戏 SFX 音频引擎优化规范 (Audio Design & Haptic Feedback)
targetGames.forEach(game => {
  const sfxPath = path.join(__dirname, 'public', game, 'sfx.js');
  assert(fs.existsSync(sfxPath), `[${game}] sfx.js 必须存在`);
  const sfxContent = fs.readFileSync(sfxPath, 'utf8');

  // Audio Design: Master Gain Bus & Pitch Jitter
  assert(sfxContent.includes('masterGain') || sfxContent.includes('getMasterOut'), `[${game}] 必须包含 Master Gain 总线防止爆音`);
  assert(sfxContent.includes('_jitter'), `[${game}] 必须包含 _jitter 随机音高微扰防机械单调`);

  // Game Feel: Haptic Vibration
  assert(sfxContent.includes('vibrate'), `[${game}] 必须包含触觉震动反馈能力`);

  // Gesture Unlock
  assert(sfxContent.includes('pointerdown') || sfxContent.includes('touchstart'), `[${game}] 必须包含移动端手势自动解锁音频上下文监听`);

  console.log(`  ✓ [${game}] SFX 原生音频与触觉规范验证通过 (Master Bus + Jitter + Vibration)`);
});

// 3. 验证斗地主与麻将未受影响 (零修改约束)
const gitDiffOutput = require('child_process').execSync('git status --porcelain').toString();
assert(!gitDiffOutput.includes('games/doudizhu'), '严禁修改 games/doudizhu');
assert(!gitDiffOutput.includes('public/doudizhu'), '严禁修改 public/doudizhu');
assert(!gitDiffOutput.includes('games/mahjong'), '严禁修改 games/mahjong');
assert(!gitDiffOutput.includes('public/mahjong'), '严禁修改 public/mahjong');
console.log('  ✓ 严格核验通过：斗地主与麻将代码零变动！');

console.log('🎉🎉 4 款游戏 Agent Skills 综合优化测试 100% 全部通过！\n');
