// 极清国风立体骨玉麻将牌组件渲染引擎 (SVG & CSS 拟真骨玉雕花 + 极速角标辨析)
(function(exports) {
  const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // 生成单张麻将牌内部高辨识度 3D 矢量雕刻 SVG
  function getTileSvg(suit, rank) {
    if (suit === 'wan') {
      const num = NUMERALS[rank] || rank;
      // 1万与5万传统经典大红，其余万字为深邃曜黑
      const isRedNum = (rank === 1 || rank === 5);
      const numColor = isRedNum ? '#dc2626' : '#0f172a';
      return `
        <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
          <defs>
            <filter id="carve-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0.5" dy="1" stdDeviation="0.5" flood-color="rgba(0,0,0,0.22)"/>
            </filter>
          </defs>
          <!-- 左上角极速辨认小角标 (专为手机端小屏幕速辨设计) -->
          <g opacity="0.85">
            <text x="12" y="23" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="17" text-anchor="middle" fill="${numColor}">${rank}</text>
            <text x="12" y="37" font-family="'Noto Serif SC', 'Songti SC', 'SimSun', serif" font-weight="900" font-size="12" text-anchor="middle" fill="#dc2626">萬</text>
          </g>
          <!-- 牌面正中央雕刻大字 -->
          <g filter="url(#carve-shadow)">
            <text x="54" y="58" font-family="'Noto Serif SC', 'Songti SC', 'SimSun', serif" font-weight="900" font-size="47" text-anchor="middle" fill="${numColor}">${num}</text>
            <text x="54" y="115" font-family="'Noto Serif SC', 'Songti SC', 'SimSun', serif" font-weight="900" font-size="49" text-anchor="middle" fill="#dc2626">萬</text>
          </g>
        </svg>
      `;
    }

    if (suit === 'tong') {
      // 铜钱轮宝点位坐标与配色彩格
      if (rank === 1) {
        // 大一筒：华丽帝王宝相花四色轮盘
        return `
          <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
            <defs>
              <radialGradient id="tong1-sun" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#ef4444"/>
                <stop offset="50%" stop-color="#b91c1c"/>
                <stop offset="75%" stop-color="#047857"/>
                <stop offset="100%" stop-color="#064e3b"/>
              </radialGradient>
            </defs>
            <!-- 左上角速辨小角标 -->
            <g opacity="0.85">
              <text x="12" y="23" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="900" font-size="17" text-anchor="middle" fill="#2563eb">1</text>
              <text x="12" y="37" font-family="'Noto Serif SC', serif" font-weight="900" font-size="12" text-anchor="middle" fill="#15803d">筒</text>
            </g>
            <g transform="translate(4, 3)">
              <!-- 外圈吉祥金齿花轮 -->
              <circle cx="50" cy="66" r="42" fill="none" stroke="#d97706" stroke-width="2.5" stroke-dasharray="6,3"/>
              <circle cx="50" cy="66" r="39" fill="url(#tong1-sun)" stroke="#047857" stroke-width="2"/>
              <!-- 12 瓣金线花芒 -->
              <circle cx="50" cy="66" r="26" fill="#f8fafc" stroke="#b45309" stroke-width="1.5"/>
              <circle cx="50" cy="66" r="17" fill="#dc2626"/>
              <circle cx="50" cy="66" r="7" fill="#fef08a"/>
              <circle cx="50" cy="66" r="2.5" fill="#991b1b"/>
            </g>
          </svg>
        `;
      }

      // 2~9 筒的点位与经典川麻配色 (绿、蓝、红)
      const dotCoords = {
        2: [ [50, 36, '#2563eb'], [50, 99, '#15803d'] ],
        3: [ [27, 32, '#2563eb'], [50, 67.5, '#dc2626'], [73, 103, '#15803d'] ],
        4: [ [33, 36, '#2563eb'], [67, 36, '#15803d'], [33, 99, '#15803d'], [67, 99, '#2563eb'] ],
        5: [ [28, 32, '#2563eb'], [72, 32, '#15803d'], [50, 67.5, '#dc2626'], [28, 103, '#15803d'], [72, 103, '#2563eb'] ],
        6: [ [33, 30, '#15803d'], [67, 30, '#15803d'], [33, 67.5, '#dc2626'], [67, 67.5, '#dc2626'], [33, 105, '#dc2626'], [67, 105, '#dc2626'] ],
        7: [ [25, 26, '#15803d'], [50, 42, '#15803d'], [75, 58, '#15803d'], [33, 85, '#dc2626'], [67, 85, '#dc2626'], [33, 112, '#dc2626'], [67, 112, '#dc2626'] ],
        8: [ [33, 24, '#2563eb'], [67, 24, '#2563eb'], [33, 53, '#2563eb'], [67, 53, '#2563eb'], [33, 82, '#2563eb'], [67, 82, '#2563eb'], [33, 111, '#2563eb'], [67, 111, '#2563eb'] ],
        9: [ [26, 26, '#15803d'], [50, 26, '#2563eb'], [74, 26, '#dc2626'], [26, 67.5, '#15803d'], [50, 67.5, '#2563eb'], [74, 67.5, '#dc2626'], [26, 109, '#15803d'], [50, 109, '#2563eb'], [74, 109, '#dc2626'] ]
      };

      // 制作立体铜钱凹凸花纹
      const dotsSvg = (dotCoords[rank] || []).map(([cx, cy, color]) => {
        return `
          <g>
            <circle cx="${cx}" cy="${cy}" r="13" fill="${color}" stroke="#0f172a" stroke-width="1.2" />
            <circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="#f8fafc" stroke-width="1.8" opacity="0.9" />
            <circle cx="${cx}" cy="${cy}" r="5" fill="#f8fafc" opacity="0.9" />
            <circle cx="${cx}" cy="${cy}" r="2" fill="${color}" />
          </g>
        `;
      }).join('');

      return `
        <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
          <!-- 左上角速辨小角标 -->
          <g opacity="0.85">
            <text x="12" y="23" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="900" font-size="17" text-anchor="middle" fill="#2563eb">${rank}</text>
            <text x="12" y="37" font-family="'Noto Serif SC', serif" font-weight="900" font-size="12" text-anchor="middle" fill="#15803d">筒</text>
          </g>
          ${dotsSvg}
        </svg>
      `;
    }

    if (suit === 'tiao') {
      if (rank === 1) {
        // 一条：吉祥神鸟雀雀 (麻雀神鸟)
        return `
          <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
            <!-- 左上角速辨小角标 -->
            <g opacity="0.85">
              <text x="12" y="23" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="900" font-size="17" text-anchor="middle" fill="#15803d">1</text>
              <text x="12" y="37" font-family="'Noto Serif SC', serif" font-weight="900" font-size="12" text-anchor="middle" fill="#15803d">条</text>
            </g>
            <!-- 雀鸟躯干与羽毛 -->
            <g transform="translate(3, 2)">
              <path d="M50 14 C38 24 33 40 40 56 C33 62 23 77 30 96 C36 112 48 122 48 122 C48 122 60 112 66 96 C73 77 63 62 56 56 C63 40 58 24 50 14 Z" fill="#15803d" stroke="#064e3b" stroke-width="1.5"/>
              <path d="M48 20 C40 35 43 49 48 51 C53 49 56 35 50 20 Z" fill="#ef4444"/>
              <circle cx="45" cy="30" r="3" fill="#fef08a"/>
              <circle cx="45" cy="30" r="1.5" fill="#0f172a"/>
              <path d="M28 65 Q16 80 23 105 Q33 90 33 75 Z" fill="#16a34a" stroke="#064e3b" stroke-width="1"/>
              <path d="M68 65 Q80 80 73 105 Q63 90 63 75 Z" fill="#16a34a" stroke="#064e3b" stroke-width="1"/>
              <!-- 红宝石尾羽珍珠 -->
              <circle cx="48" cy="85" r="7.5" fill="#dc2626" stroke="#fbbf24" stroke-width="1.5"/>
              <path d="M45 118 L41 130 M51 118 L55 130" stroke="#b45309" stroke-width="3.5" stroke-linecap="round"/>
            </g>
          </svg>
        `;
      }

      // 2~9 条的竹节立柱布局
      const barCoords = {
        2: [ [50, 22, 50, 60, '#15803d'], [50, 75, 50, 113, '#15803d'] ],
        3: [ [50, 22, 50, 58, '#2563eb'], [32, 77, 32, 113, '#15803d'], [68, 77, 68, 113, '#15803d'] ],
        4: [ [32, 22, 32, 60, '#15803d'], [68, 22, 68, 60, '#2563eb'], [32, 75, 32, 113, '#2563eb'], [68, 75, 68, 113, '#15803d'] ],
        5: [ [28, 22, 28, 60, '#15803d'], [72, 22, 72, 60, '#2563eb'], [50, 50, 50, 85, '#dc2626'], [28, 75, 28, 113, '#2563eb'], [72, 75, 72, 113, '#15803d'] ],
        6: [ [28, 22, 28, 60, '#15803d'], [50, 22, 50, 60, '#15803d'], [72, 22, 72, 60, '#15803d'], [28, 75, 28, 113, '#15803d'], [50, 75, 50, 113, '#15803d'], [72, 75, 72, 113, '#15803d'] ],
        7: [ [50, 18, 50, 52, '#dc2626'], [28, 48, 28, 78, '#15803d'], [72, 48, 72, 78, '#15803d'], [28, 85, 28, 115, '#15803d'], [42, 85, 42, 115, '#15803d'], [58, 85, 58, 115, '#15803d'], [72, 85, 72, 115, '#15803d'] ],
        8: [ [26, 20, 26, 55, '#15803d'], [42, 20, 42, 55, '#15803d'], [58, 20, 58, 55, '#15803d'], [74, 20, 74, 55, '#15803d'], [26, 80, 26, 115, '#15803d'], [42, 80, 42, 115, '#15803d'], [58, 80, 58, 115, '#15803d'], [74, 80, 74, 115, '#15803d'] ],
        9: [ [26, 20, 26, 52, '#dc2626'], [50, 20, 50, 52, '#2563eb'], [74, 20, 74, 52, '#15803d'], [26, 52, 26, 84, '#dc2626'], [50, 52, 50, 84, '#2563eb'], [74, 52, 74, 84, '#15803d'], [26, 84, 26, 116, '#dc2626'], [50, 84, 50, 116, '#2563eb'], [74, 84, 74, 116, '#15803d'] ]
      };

      const bars = (barCoords[rank] || []).map(([x1, y1, x2, y2, col]) => {
        const midY = (y1 + y2) / 2;
        return `
          <g>
            <!-- 双段竹节主干 -->
            <line x1="${x1}" y1="${y1}" x2="${x1}" y2="${midY - 2}" stroke="${col}" stroke-width="6.5" stroke-linecap="round" />
            <line x1="${x1}" y1="${midY + 2}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="6.5" stroke-linecap="round" />
            <!-- 竹节凸起金红骨节扣 -->
            <circle cx="${x1}" cy="${y1}" r="3.5" fill="#fef08a" stroke="#78350f" stroke-width="0.8" />
            <circle cx="${x1}" cy="${midY}" r="4.5" fill="#dc2626" stroke="#fef08a" stroke-width="1" />
            <circle cx="${x2}" cy="${y2}" r="3.5" fill="#fef08a" stroke="#78350f" stroke-width="0.8" />
          </g>
        `;
      }).join('');

      return `
        <svg viewBox="0 0 100 135" class="mj-svg" width="100%" height="100%">
          <!-- 左上角速辨小角标 -->
          <g opacity="0.85">
            <text x="12" y="23" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="900" font-size="17" text-anchor="middle" fill="#15803d">${rank}</text>
            <text x="12" y="37" font-family="'Noto Serif SC', serif" font-weight="900" font-size="12" text-anchor="middle" fill="#15803d">条</text>
          </g>
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
