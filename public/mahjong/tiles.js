// 极清国风立体骨玉麻将牌组件渲染引擎 (纯正传统牌面 + 去除杂乱文字 + 极美高雅花色)
(function(exports) {
  const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // 生成单张麻将牌内部高辨识度矢量雕刻 SVG (纯粹国风，无左上角现代文字角标)
  function getTileSvg(suit, rank) {
    if (suit === 'wan') {
      const num = NUMERALS[rank] || rank;
      // 1万与5万传统经典大红，其余万字为纯正国风墨黑
      const isRedNum = (rank === 1 || rank === 5);
      const numColor = isRedNum ? '#dc2626' : '#1e293b';
      return `
        <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
          <defs>
            <filter id="carve-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0.5" dy="1" stdDeviation="0.6" flood-color="rgba(0,0,0,0.2)"/>
            </filter>
          </defs>
          <!-- 传统经典楷书大字 (一至九 + 繁体經典萬) -->
          <g filter="url(#carve-shadow)">
            <text x="50" y="55" font-family="'Kaiti', 'STKaiti', 'KaiTi_GB2312', 'FZKai-Z03S', 'Noto Serif SC', serif" font-weight="900" font-size="46" text-anchor="middle" fill="${numColor}">${num}</text>
            <text x="50" y="112" font-family="'Kaiti', 'STKaiti', 'KaiTi_GB2312', 'FZKai-Z03S', 'Noto Serif SC', serif" font-weight="900" font-size="48" text-anchor="middle" fill="#dc2626">萬</text>
          </g>
        </svg>
      `;
    }

    if (suit === 'tong') {
      if (rank === 1) {
        // 大一筒：华美四色同心宝相花神轮
        return `
          <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
            <defs>
              <radialGradient id="tong1-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#f87171"/>
                <stop offset="45%" stop-color="#dc2626"/>
                <stop offset="70%" stop-color="#059669"/>
                <stop offset="100%" stop-color="#047857"/>
              </radialGradient>
            </defs>
            <g transform="translate(0, 0)">
              <!-- 外圈 8 瓣祥瑞如意翡翠金齿花轮 -->
              <circle cx="50" cy="67.5" r="43" fill="none" stroke="#d97706" stroke-width="2.5" stroke-dasharray="7,3.5"/>
              <circle cx="50" cy="67.5" r="40" fill="url(#tong1-glow)" stroke="#047857" stroke-width="2"/>
              <!-- 16 颗同心金珍珠圈 -->
              <circle cx="50" cy="67.5" r="28" fill="#fdfbf7" stroke="#b45309" stroke-width="1.8"/>
              <!-- 内层朱红宝相花 -->
              <circle cx="50" cy="67.5" r="19" fill="#dc2626" stroke="#fbbf24" stroke-width="1.2"/>
              <!-- 金蕊宝石核心 -->
              <circle cx="50" cy="67.5" r="9" fill="#fef08a" stroke="#b45309" stroke-width="1"/>
              <circle cx="50" cy="67.5" r="4" fill="#1d4ed8"/>
            </g>
          </svg>
        `;
      }

      // 2~9 筒的点位与传统川麻配色 (孔雀绿、宝蓝、正红)
      const dotCoords = {
        2: [ [50, 37, '#1d4ed8'], [50, 98, '#15803d'] ],
        3: [ [27, 32, '#1d4ed8'], [50, 67.5, '#dc2626'], [73, 103, '#15803d'] ],
        4: [ [31, 36, '#1d4ed8'], [69, 36, '#15803d'], [31, 99, '#15803d'], [69, 99, '#1d4ed8'] ],
        5: [ [27, 32, '#1d4ed8'], [73, 32, '#15803d'], [50, 67.5, '#dc2626', 15], [27, 103, '#15803d'], [73, 103, '#1d4ed8'] ],
        6: [ [31, 32, '#15803d'], [69, 32, '#15803d'], [31, 67.5, '#dc2626'], [69, 67.5, '#dc2626'], [31, 103, '#dc2626'], [69, 103, '#dc2626'] ],
        7: [ [25, 26, '#15803d'], [50, 43, '#15803d'], [75, 60, '#15803d'], [31, 86, '#dc2626'], [69, 86, '#dc2626'], [31, 112, '#dc2626'], [69, 112, '#dc2626'] ],
        8: [ [31, 25, '#1d4ed8'], [69, 25, '#1d4ed8'], [31, 53, '#1d4ed8'], [69, 53, '#1d4ed8'], [31, 82, '#1d4ed8'], [69, 82, '#1d4ed8'], [31, 110, '#1d4ed8'], [69, 110, '#1d4ed8'] ],
        9: [ [26, 27, '#15803d'], [50, 27, '#1d4ed8'], [74, 27, '#dc2626'], [26, 67.5, '#15803d'], [50, 67.5, '#1d4ed8'], [74, 67.5, '#dc2626'], [26, 108, '#15803d'], [50, 108, '#1d4ed8'], [74, 108, '#dc2626'] ]
      };

      // 制作立体纯正同心圆雕花铜钱
      const dotsSvg = (dotCoords[rank] || []).map(([cx, cy, color, customRadius]) => {
        const r = customRadius || 13;
        return `
          <g>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#0f172a" stroke-width="1.2" />
            <circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="none" stroke="#fdfbf7" stroke-width="1.8" opacity="0.92" />
            <circle cx="${cx}" cy="${cy}" r="${r * 0.38}" fill="#fdfbf7" opacity="0.9" />
            <circle cx="${cx}" cy="${cy}" r="${r * 0.16}" fill="${color}" />
          </g>
        `;
      }).join('');

      return `
        <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
          ${dotsSvg}
        </svg>
      `;
    }

    if (suit === 'tiao') {
      if (rank === 1) {
        // 一条：吉祥展翅雀雀 (麻雀神鸟踏竹)
        return `
          <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
            <defs>
              <linearGradient id="bird-wing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#15803d"/>
                <stop offset="70%" stop-color="#047857"/>
                <stop offset="100%" stop-color="#064e3b"/>
              </linearGradient>
            </defs>
            <g transform="translate(0, 2)">
              <!-- 栖木竹节 -->
              <line x1="20" y1="120" x2="80" y2="120" stroke="#15803d" stroke-width="6" stroke-linecap="round"/>
              <circle cx="50" cy="120" r="4.5" fill="#fef08a" stroke="#78350f" stroke-width="1"/>
              <!-- 雀鸟尾羽孔雀翎 -->
              <path d="M42 90 C36 106 30 114 26 118" stroke="#15803d" stroke-width="4.5" stroke-linecap="round"/>
              <path d="M50 92 L50 118" stroke="#15803d" stroke-width="5" stroke-linecap="round"/>
              <path d="M58 90 C64 106 70 114 74 118" stroke="#15803d" stroke-width="4.5" stroke-linecap="round"/>
              <circle cx="50" cy="98" r="7.5" fill="#dc2626" stroke="#fbbf24" stroke-width="1.5"/>
              <!-- 雀鸟躯干与华羽 -->
              <path d="M50 14 C36 26 32 44 40 60 C32 66 22 82 32 98 C40 110 50 114 50 114 C50 114 60 110 68 98 C78 82 68 66 60 60 C68 44 64 26 50 14 Z" fill="url(#bird-wing)" stroke="#064e3b" stroke-width="1.2"/>
              <!-- 锦绣胸羽与脸颊 -->
              <path d="M48 22 C38 38 42 52 48 54 C54 52 58 38 52 22 Z" fill="#ef4444"/>
              <circle cx="45" cy="31" r="3.2" fill="#fef08a"/>
              <circle cx="45" cy="31" r="1.6" fill="#0f172a"/>
              <!-- 左右振翅羽毛 -->
              <path d="M26 64 Q14 80 22 102 Q33 88 33 74 Z" fill="#16a34a" stroke="#064e3b" stroke-width="1"/>
              <path d="M74 64 Q86 80 78 102 Q67 88 67 74 Z" fill="#16a34a" stroke="#064e3b" stroke-width="1"/>
              <!-- 金色灵冠 -->
              <polygon points="50,9 46,16 54,16" fill="#fbbf24"/>
            </g>
          </svg>
        `;
      }

      // 2~9 条的竹节立柱布局
      const barCoords = {
        2: [ [50, 22, 50, 60, '#15803d'], [50, 75, 50, 113, '#15803d'] ],
        3: [ [50, 22, 50, 58, '#1d4ed8'], [32, 77, 32, 113, '#15803d'], [68, 77, 68, 113, '#15803d'] ],
        4: [ [32, 22, 32, 60, '#15803d'], [68, 22, 68, 60, '#1d4ed8'], [32, 75, 32, 113, '#1d4ed8'], [68, 75, 68, 113, '#15803d'] ],
        5: [ [28, 22, 28, 60, '#15803d'], [72, 22, 72, 60, '#1d4ed8'], [50, 49, 50, 86, '#dc2626'], [28, 75, 28, 113, '#1d4ed8'], [72, 75, 72, 113, '#15803d'] ],
        6: [ [28, 22, 28, 60, '#15803d'], [50, 22, 50, 60, '#15803d'], [72, 22, 72, 60, '#15803d'], [28, 75, 28, 113, '#15803d'], [50, 75, 50, 113, '#15803d'], [72, 75, 72, 113, '#15803d'] ],
        7: [ [50, 18, 50, 52, '#dc2626'], [28, 48, 28, 78, '#15803d'], [72, 48, 72, 78, '#15803d'], [28, 85, 28, 115, '#15803d'], [42, 85, 42, 115, '#15803d'], [58, 85, 58, 115, '#15803d'], [72, 85, 72, 115, '#15803d'] ],
        8: [ [26, 20, 26, 55, '#15803d'], [42, 20, 42, 55, '#15803d'], [58, 20, 58, 55, '#15803d'], [74, 20, 74, 55, '#15803d'], [26, 80, 26, 115, '#15803d'], [42, 80, 42, 115, '#15803d'], [58, 80, 58, 115, '#15803d'], [74, 80, 74, 115, '#15803d'] ],
        9: [ [26, 20, 26, 52, '#dc2626'], [50, 20, 50, 52, '#1d4ed8'], [74, 20, 74, 52, '#15803d'], [26, 52, 26, 84, '#dc2626'], [50, 52, 50, 84, '#1d4ed8'], [74, 52, 74, 84, '#15803d'], [26, 84, 26, 116, '#dc2626'], [50, 84, 50, 116, '#1d4ed8'], [74, 84, 74, 116, '#15803d'] ]
      };

      const bars = (barCoords[rank] || []).map(([x1, y1, x2, y2, col]) => {
        const midY = (y1 + y2) / 2;
        return `
          <g>
            <!-- 双段仿真青竹干 -->
            <line x1="${x1}" y1="${y1}" x2="${x1}" y2="${midY - 2.5}" stroke="${col}" stroke-width="6.5" stroke-linecap="round" />
            <line x1="${x1}" y1="${midY + 2.5}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="6.5" stroke-linecap="round" />
            <!-- 竹节骨结扣 (金圈红宝) -->
            <circle cx="${x1}" cy="${y1}" r="3.2" fill="#fef08a" stroke="#78350f" stroke-width="0.8" />
            <circle cx="${x1}" cy="${midY}" r="4.5" fill="#dc2626" stroke="#fef08a" stroke-width="1.2" />
            <circle cx="${x2}" cy="${y2}" r="3.2" fill="#fef08a" stroke="#78350f" stroke-width="0.8" />
          </g>
        `;
      }).join('');

      return `
        <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
          ${bars}
        </svg>
      `;
    }

    // 默认空牌面
    return `
      <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
        <rect x="8" y="8" width="84" height="119" rx="6" fill="none" stroke="rgba(203, 213, 225, 0.4)" stroke-width="2" stroke-dasharray="4,4"/>
      </svg>
    `;
  }

  // 构造并返回一个包含完整 3D 骨玉质感的麻将牌 DOM 元素
  function createTileElement(tile, options = {}) {
    const {
      size = 'normal',      // 'normal' (手牌), 'discard' (牌桌弃牌), 'mini' (副露/揭牌), 'back' (牌背)
      isSelected = false,   // 是否被手指选中上浮
      isQue = false,        // 是否为玩家定缺花色 (变灰不可出)
      isTing = false,       // 是否为听牌标记
      isNewDraw = false,    // 是否为刚刚摸上的新牌 (微距错开)
      isBack = false        // 是否展示牌背 (对手盖牌)
    } = options;

    const el = document.createElement('div');
    el.className = `mj-tile mj-size-${size} ${isSelected ? 'selected' : ''} ${isQue ? 'is-que' : ''} ${isNewDraw ? 'new-draw' : ''} ${isBack ? 'tile-back' : ''}`;

    if (tile && tile.id) el.dataset.id = tile.id;
    if (tile && tile.suit) el.dataset.suit = tile.suit;
    if (tile && tile.rank) el.dataset.rank = tile.rank;

    // 牌背渲染：极致新国风翠玉材质，内嵌细金线与如意云纹，绝不绘制红中字符！
    if (isBack || size === 'back') {
      el.innerHTML = `
        <div class="mj-face-back">
          <svg viewBox="0 0 40 56" class="mj-back-svg" width="100%" height="100%">
            <defs>
              <linearGradient id="jade-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#059669"/>
                <stop offset="45%" stop-color="#047857"/>
                <stop offset="100%" stop-color="#064e3b"/>
              </linearGradient>
              <pattern id="jade-lattice" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 4 L4 0 L8 4 L4 8 Z" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
              </pattern>
            </defs>
            <rect x="1" y="1" width="38" height="54" rx="4" fill="url(#jade-bg-grad)" stroke="#10b981" stroke-width="1.2"/>
            <rect x="3" y="3" width="34" height="50" rx="3" fill="url(#jade-lattice)"/>
            <rect x="4" y="4" width="32" height="48" rx="2" fill="none" stroke="rgba(251, 191, 36, 0.45)" stroke-width="0.8"/>
          </svg>
        </div>
      `;
      return el;
    }

    if (!tile) {
      el.innerHTML = `<div class="mj-face-front"></div>`;
      return el;
    }

    const svgHtml = getTileSvg(tile.suit, tile.rank);
    let tingBadge = '';
    if (isTing) {
      tingBadge = `<div class="mj-ting-badge">听</div>`;
    }

    let queBadge = '';
    if (isQue) {
      queBadge = `<div class="mj-que-badge">定缺</div>`;
    }

    el.innerHTML = `
      <div class="mj-tile-body">
        <div class="mj-face-front">
          ${svgHtml}
          ${tingBadge}
          ${queBadge}
        </div>
        <div class="mj-side-edge"></div>
        <div class="mj-bottom-base"></div>
      </div>
    `;

    return el;
  }

  exports.getTileSvg = getTileSvg;
  exports.createTileElement = createTileElement;
})(typeof window !== 'undefined' ? (window.MahjongTiles = {}) : module.exports);
