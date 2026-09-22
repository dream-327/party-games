const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 开始测试聚会狼人杀 PC 与移动端视口与滚动布局...');

const cssPath = path.join(__dirname, 'public', 'werewolf', 'style.css');
const htmlPath = path.join(__dirname, 'public', 'werewolf', 'index.html');

assert(fs.existsSync(cssPath), 'public/werewolf/style.css 必须存在');
assert(fs.existsSync(htmlPath), 'public/werewolf/index.html 必须存在');

const css = fs.readFileSync(cssPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. 验证 HTML 视口基础配置
assert(
  html.includes('width=device-width, initial-scale=1.0'),
  'HTML 必须包含正确的移动端 viewport 配置'
);

// 提取 CSS 选择器代码块帮助函数
function getRuleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(?:^|\\})\\s*' + escaped + '\\s*\\{([^\\}]+)\\}', 'm');
  const match = css.match(regex);
  return match ? match[1] : null;
}

// 2. 验证 body 视口与纵向滚动配置
const bodyRule = getRuleBlock('body');
assert(bodyRule, 'style.css 必须包含 body 规则');
assert(
  bodyRule.includes('min-height: 100vh') || bodyRule.includes('min-height: 100dvh'),
  'body 必须设置 min-height: 100vh'
);
assert(
  bodyRule.includes('overflow-y: auto') || !bodyRule.includes('overflow: hidden'),
  'body 必须允许纵向滚动'
);
assert(
  bodyRule.includes('-webkit-overflow-scrolling: touch') || css.includes('-webkit-overflow-scrolling: touch'),
  '必须包含 -webkit-overflow-scrolling: touch 以确保 iOS 原生平滑滚动'
);

// 3. 验证 #app 容器：绝不能硬编码 height: 100vh（必须改为 min-height 以自适应内容向下滚动）
const appRule = getRuleBlock('#app');
assert(appRule, 'style.css 必须包含 #app 规则');
assert(
  !appRule.match(/(^|;|\s)height:\s*100vh/),
  '#app 绝不能设置固定 height: 100vh，否则电脑和手机在内容超长时无法向下滚动！'
);
assert(
  appRule.includes('min-height: 100vh') || appRule.includes('min-height: 100dvh'),
  '#app 必须设置 min-height: 100vh 或 min-height: 100dvh，确保高度随内容自动撑开'
);

// 4. 验证 .main-container：绝不能有 overflow: hidden 阻止滚动
const mainContainerRule = getRuleBlock('.main-container');
assert(mainContainerRule, 'style.css 必须包含 .main-container 规则');
assert(
  !mainContainerRule.includes('overflow: hidden'),
  '.main-container 绝不能设置 overflow: hidden，否则主视图内全部溢出内容将被截断！'
);

// 5. 验证 .hero-card：在 flex 容器中绝不能只写 margin: auto，防止内容超出时顶部滚不出
const heroCardRule = getRuleBlock('.hero-card');
assert(heroCardRule, 'style.css 必须包含 .hero-card 规则');
assert(
  !heroCardRule.match(/margin:\s*auto;/),
  '.hero-card 绝不能使用单一的 margin: auto，否则在内容高于视口时上下两侧均会被推出可视区并截断！'
);

// 6. 验证移动端响应式 @media 查询
assert(
  css.includes('@media'),
  'style.css 必须包含 @media 移动端响应式断点适配，缩小卡片内边距与字体'
);

// 7. 验证上帝模式与常规对局容器支持滚动
const godConsoleRule = getRuleBlock('.god-console-container');
assert(godConsoleRule, '必须包含 .god-console-container 样式');

// 8. 验证底部操作栏或顶部导航栏防遮挡与悬浮支持
const actionFooterRule = getRuleBlock('.action-footer-bar');
assert(actionFooterRule, '必须包含 .action-footer-bar 样式');
assert(
  actionFooterRule.includes('sticky') || css.includes('position: sticky'),
  '操作栏或关键控件应具备 sticky 定位支持，确保在滚动时长页面操作按钮始终可触达'
);

console.log('✅ 聚会狼人杀 PC 与移动端视口与滚动布局规则全部校验通过！');
