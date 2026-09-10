// 极清国风立体玉石麻将牌组件渲染引擎 (SVG & CSS 拟真骨玉雕花)
(function(exports) {
  const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // 生成单张麻将牌内部 SVG 图形
  function getTileSvg(suit, rank) {
    if (suit === 'wan') {
      const num = NUMERALS[rank] || rank;
      const numColor = (rank === 5 || rank === 1) ? '#dc2626' : '#1e293b';
      return `
        <svg viewBox="0 0 100 135" class="mj-svg">
          <text x="50" y="55" font-family="'Noto Serif SC', 'Songti SC', 'SimSun', serif" font-weight="900" font-size="46" text-anchor="middle" fill="${numColor}">${num}</text>
          <text x="50" y="112" font-family="'Noto Serif SC', 'Songti SC', 'SimSun', serif" font-weight="900" font-size="48" text-anchor="middle" fill="#dc2626">萬</text>
        </svg>
      `;
    }

    if (suit === 'tong') {
      if (rank === 1) {
        // 大一筒：华丽四色宝相花轮盘
        return `
          <svg viewBox="0 0 100 135" class="mj-svg">
            <defs>
              <radialGradient id="tong1-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#ef4444" />
                <stop offset="45%" stop-color="#dc2626" />
                <stop offset="70%" stop-color="#15803d" />
                <stop offset="100%" stop-color="#047857" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="67.5" r="42" fill="none" stroke="#059669" stroke-width="4" stroke-dasharray="6,3" />
            <circle cx="50" cy="67.5" r="36" fill="url(#tong1-grad)" />
            <circle cx="50" cy="67.5" r="22" fill="#f8fafc" />
            <circle cx="50" cy="67.5" r="14" fill="#dc2626" />
            <circle cx="50" cy="67.5" r="5" fill="#fef08a" />
          </svg>
        `;
      }

      // 2~9 筒的标准点位坐标布局
      const dotCoords = {
        2: [ [50, 36, '#2563eb'], [50, 99, '#16a34a'] ],
        3: [ [28, 32, '#2563eb'], [50, 67.5, '#dc2626'], [72, 103, '#16a34a'] ],
        4: [ [32, 36, '#2563eb'], [68, 36, '#16a34a'], [32, 99, '#16a34a'], [68, 99, '#2563eb'] ],
        5: [ [28, 32, '#2563eb'], [72, 32, '#16a34a'], [50, 67.5, '#dc2626'], [28, 103, '#16a34a'], [72, 103, '#2563eb'] ],
        6: [ [32, 30, '#16a34a'], [68, 30, '#16a34a'], [32, 67.5, '#dc2626'], [68, 67.5, '#dc2626'], [32, 105, '#dc2626'], [68, 105, '#dc2626'] ],
        7: [ [25, 26, '#16a34a'], [50, 42, '#16a34a'], [75, 58, '#16a34a'], [32, 85, '#dc2626'], [68, 85, '#dc2626'], [32, 112, '#dc2626'], [68, 112, '#dc2626'] ],
        8: [ [32, 24, '#2563eb'], [68, 24, '#2563eb'], [32, 53, '#2563eb'], [68, 53, '#2563eb'], [32, 82, '#2563eb'], [68, 82, '#2563eb'], [32, 111, '#2563eb'], [68, 111, '#2563eb'] ],
        9: [ [26, 26, '#16a34a'], [50, 26, '#2563eb'], [74, 26, '#dc2626'], [26, 67.5, '#16a34a'], [50, 67.5, '#2563eb'], [74, 67.5, '#dc2626'], [26, 109, '#16a34a'], [50, 109, '#2563eb'], [74, 109, '#dc2626'] ]
      };

      const dots = (dotCoords[rank] || []).map(([cx, cy, color]) => {
        return `
          <circle cx="${cx}" cy="${cy}" r="12" fill="${color}" stroke="#1e293b" stroke-width="1.5" />
          <circle cx="${cx}" cy="${cy}" r="6" fill="#f8fafc" opacity="0.85" />
          <circle cx="${cx}" cy="${cy}" r="2" fill="${color}" />
        `;
      }).join('');

      return `<svg viewBox="0 0 100 135" class="mj-svg">${dots}</svg>`;
    }

    if (suit === 'tiao') {
      if (rank === 1) {
        // 一条：吉祥神鸟雀雀
        return `
          <svg viewBox="0 0 100 135" class="mj-svg">
            <path d="M50 15 C40 25 35 40 42 55 C35 60 25 75 32 95 C38 110 50 120 50 120 C50 120 62 110 68 95 C75 75 65 60 58 55 C65 40 60 25 50 15 Z" fill="#15803d" />
            <path d="M48 20 C42 35 45 48 50 50 C55 48 58 35 52 20 Z" fill="#ef4444" />
            <circle cx="46" cy="30" r="2.5" fill="#fef08a" />
            <path d="M30 65 Q18 80 25 105 Q35 90 35 75 Z" fill="#16a34a" />
            <path d="M70 65 Q82 80 75 105 Q65 90 65 75 Z" fill="#16a34a" />
            <circle cx="50" cy="85" r="7" fill="#dc2626" />
            <path d="M47 118 L43 130 M53 118 L57 130" stroke="#b45309" stroke-width="3" stroke-linecap="round" />
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
          <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="6" stroke-linecap="round" />
          <circle cx="${x1}" cy="${y1}" r="3.5" fill="#fef08a" />
          <circle cx="${x1}" cy="${midY}" r="4" fill="#dc2626" />
          <circle cx="${x2}" cy="${y2}" r="3.5" fill="#fef08a" />
        `;
      }).join('');

      return `<svg viewBox="0 0 100 135" class="mj-svg">${bars}</svg>`;
    }

    return `<svg viewBox="0 0 100 135" class="mj-svg"><text x="50" y="70" font-size="28" text-anchor="middle" fill="#999">🀄</text></svg>`;
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

    if (isBack || size === 'back') {
      el.innerHTML = `
        <div class="mj-face-back">
          <div class="mj-jade-texture"></div>
          <div class="mj-back-pattern">🀄</div>
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
