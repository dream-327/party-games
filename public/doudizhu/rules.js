/**
 * Dou Dizhu Rules Engine (斗地主核心规则引擎)
 * 适配浏览器与 Node.js 双端环境 (UMD)
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DouDizhuRules = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  const SUITS = ['♠', '♥', '♣', '♦'];
  const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

  // 卡牌数值映射（3为3，A为14，2为15，小王为16，大王为17）
  const RANK_VALUES = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
    'BJ': 16, // Black Joker (小王)
    'RJ': 17  // Red Joker (大王)
  };

  // 牌型常量
  const CARD_TYPES = {
    INVALID: 'INVALID',
    SINGLE: 'SINGLE',                     // 单张 (1)
    PAIR: 'PAIR',                         // 对子 (2)
    TRIPLE: 'TRIPLE',                     // 三不带 (3)
    TRIPLE_ONE: 'TRIPLE_ONE',             // 三带一 (4)
    TRIPLE_PAIR: 'TRIPLE_PAIR',           // 三带一对 (5)
    STRAIGHT: 'STRAIGHT',                 // 单顺/顺子 (>=5)
    STRAIGHT_PAIRS: 'STRAIGHT_PAIRS',     // 双顺/连对 (>=3对)
    AIRPLANE: 'AIRPLANE',                 // 三顺/飞机不带 (>=2组三张)
    AIRPLANE_SINGLES: 'AIRPLANE_SINGLES', // 飞机带单张 (k组三张 + k单张)
    AIRPLANE_PAIRS: 'AIRPLANE_PAIRS',     // 飞机带对子 (k组三张 + k对子)
    FOUR_TWO_SINGLES: 'FOUR_TWO_SINGLES', // 四带两单 (4+2)
    FOUR_TWO_PAIRS: 'FOUR_TWO_PAIRS',     // 四带两对 (4+4)
    BOMB: 'BOMB',                         // 普通炸弹 (4同点)
    ROCKET: 'ROCKET'                      // 火箭/王炸 (小王+大王)
  };

  // 牌型中文名称
  const CARD_TYPE_NAMES = {
    [CARD_TYPES.INVALID]: '无效牌型',
    [CARD_TYPES.SINGLE]: '单张',
    [CARD_TYPES.PAIR]: '对子',
    [CARD_TYPES.TRIPLE]: '三张不带',
    [CARD_TYPES.TRIPLE_ONE]: '三带一',
    [CARD_TYPES.TRIPLE_PAIR]: '三带一对',
    [CARD_TYPES.STRAIGHT]: '顺子',
    [CARD_TYPES.STRAIGHT_PAIRS]: '连对',
    [CARD_TYPES.AIRPLANE]: '飞机不带',
    [CARD_TYPES.AIRPLANE_SINGLES]: '飞机带单牌',
    [CARD_TYPES.AIRPLANE_PAIRS]: '飞机带对子',
    [CARD_TYPES.FOUR_TWO_SINGLES]: '四带两单',
    [CARD_TYPES.FOUR_TWO_PAIRS]: '四带两对',
    [CARD_TYPES.BOMB]: '炸弹 💣',
    [CARD_TYPES.ROCKET]: '王炸 🚀'
  };

  /**
   * 生成一副全新洗好的 54 张扑克牌
   */
  function createDeck() {
    const deck = [];
    let idCounter = 1;

    for (const rank of RANKS) {
      for (const suit of SUITS) {
        deck.push({
          id: `c_${idCounter++}`,
          suit,
          rank,
          value: RANK_VALUES[rank],
          label: `${suit}${rank}`
        });
      }
    }

    // 小王与大王
    deck.push({ id: `c_${idCounter++}`, suit: '', rank: 'BJ', value: 16, label: '小王' });
    deck.push({ id: `c_${idCounter++}`, suit: '', rank: 'RJ', value: 17, label: '大王' });

    // Fisher-Yates 洗牌
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  /**
   * 卡牌按大小排序（从大到小，用于手牌整理）
   */
  function sortCards(cards) {
    return [...cards].sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return (a.suit || '').localeCompare(b.suit || '');
    });
  }

  /**
   * 统计每种点数出现的张数
   */
  function getRankCounts(cards) {
    const counts = new Map();
    for (const c of cards) {
      counts.set(c.value, (counts.get(c.value) || 0) + 1);
    }
    return counts;
  }

  /**
   * 校验连续点数是否连续（不能包含2和王，点数必须递增且连续）
   */
  function isContinuous(values) {
    if (!values || values.length < 2) return false;
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i + 1] - values[i] !== 1) return false;
      if (values[i + 1] >= 15) return false; // 2及以上不可连
    }
    return values[values.length - 1] < 15;
  }

  /**
   * 获取点数的友好显示文本
   */
  function getRankName(value) {
    if (value === 17) return '大王';
    if (value === 16) return '小王';
    if (value === 15) return '2';
    if (value === 14) return 'A';
    if (value === 13) return 'K';
    if (value === 12) return 'Q';
    if (value === 11) return 'J';
    return String(value);
  }

  /**
   * 分析一手牌的牌型与权重
   * @param {Array} cards 选中的卡牌列表
   * @returns {Object} { type: CARD_TYPES, value: number, length: number, name: string, cards: Array }
   */
  function parseHand(cards) {
    if (!cards || cards.length === 0) {
      return { type: CARD_TYPES.INVALID, value: 0, length: 0, name: '未选牌' };
    }

    const len = cards.length;
    const rankCounts = getRankCounts(cards);
    const distinctValues = Array.from(rankCounts.keys()).sort((a, b) => a - b);

    // 1. 王炸 / 火箭 (2张)
    if (len === 2 && rankCounts.has(16) && rankCounts.has(17)) {
      return { type: CARD_TYPES.ROCKET, value: 17, length: 2, name: '王炸 🚀', cards };
    }

    // 2. 单张 (1张)
    if (len === 1) {
      const v = cards[0].value;
      return { type: CARD_TYPES.SINGLE, value: v, length: 1, name: `单张 ${getRankName(v)}`, cards };
    }

    // 3. 对子 (2张)
    if (len === 2 && distinctValues.length === 1) {
      const v = distinctValues[0];
      return { type: CARD_TYPES.PAIR, value: v, length: 2, name: `对 ${getRankName(v)}`, cards };
    }

    // 4. 三不带 (3张)
    if (len === 3 && distinctValues.length === 1) {
      const v = distinctValues[0];
      return { type: CARD_TYPES.TRIPLE, value: v, length: 3, name: `三张 ${getRankName(v)}`, cards };
    }

    // 5. 炸弹 (4张同点)
    if (len === 4 && distinctValues.length === 1) {
      const v = distinctValues[0];
      return { type: CARD_TYPES.BOMB, value: v, length: 4, name: `炸弹 💣 (${getRankName(v)})`, cards };
    }

    // 6. 三带一 (4张)
    if (len === 4 && distinctValues.length === 2) {
      for (const [val, count] of rankCounts.entries()) {
        if (count === 3) {
          return { type: CARD_TYPES.TRIPLE_ONE, value: val, length: 4, name: `三带一 (${getRankName(val)})`, cards };
        }
      }
    }

    // 7. 三带一对 (5张)
    if (len === 5 && distinctValues.length === 2) {
      let tripleVal = null;
      let pairVal = null;
      for (const [val, count] of rankCounts.entries()) {
        if (count === 3) tripleVal = val;
        if (count === 2) pairVal = val;
      }
      if (tripleVal !== null && pairVal !== null) {
        return { type: CARD_TYPES.TRIPLE_PAIR, value: tripleVal, length: 5, name: `三带对 (${getRankName(tripleVal)})`, cards };
      }
    }

    // 8. 单顺/顺子 (>= 5张，点数连续，无2和王)
    if (len >= 5 && len <= 12 && distinctValues.length === len) {
      if (isContinuous(distinctValues)) {
        const minN = getRankName(distinctValues[0]);
        const maxN = getRankName(distinctValues[distinctValues.length - 1]);
        return { type: CARD_TYPES.STRAIGHT, value: distinctValues[0], length: len, name: `顺子 (${minN}到${maxN})`, cards };
      }
    }

    // 9. 双顺/连对 (>= 6张且为偶数，每组2张，点数连续，无2和王)
    if (len >= 6 && len % 2 === 0 && distinctValues.length === len / 2) {
      const allPairs = distinctValues.every(val => rankCounts.get(val) === 2);
      if (allPairs && isContinuous(distinctValues)) {
        const minN = getRankName(distinctValues[0]);
        const maxN = getRankName(distinctValues[distinctValues.length - 1]);
        return { type: CARD_TYPES.STRAIGHT_PAIRS, value: distinctValues[0], length: distinctValues.length, name: `连对 (${minN}到${maxN})`, cards };
      }
    }

    // 提取三张组与四张组点数
    const triples = [];
    const pairs = [];
    const singles = [];
    const fours = [];

    for (const [val, count] of rankCounts.entries()) {
      if (count === 4) fours.push(val);
      if (count === 3) triples.push(val);
      if (count === 2) pairs.push(val);
      if (count === 1) singles.push(val);
    }
    triples.sort((a, b) => a - b);
    fours.sort((a, b) => a - b);

    // 10. 三顺/飞机不带翅膀 (len >= 6 且 len % 3 === 0)
    if (len >= 6 && len % 3 === 0 && triples.length === len / 3 && distinctValues.length === triples.length) {
      if (isContinuous(triples)) {
        return { type: CARD_TYPES.AIRPLANE, value: triples[0], length: triples.length, name: `飞机 (${triples.length}连三张)`, cards };
      }
    }

    // 11. 飞机带单张翅膀 (k组三张 + k个单张，总牌数 4*k)
    if (len >= 8 && len % 4 === 0) {
      const k = len / 4;
      const candidateTriples = [...triples, ...fours].filter(v => v < 15).sort((a, b) => a - b);
      for (let i = 0; i <= candidateTriples.length - k; i++) {
        const sub = candidateTriples.slice(i, i + k);
        if (isContinuous(sub)) {
          return { type: CARD_TYPES.AIRPLANE_SINGLES, value: sub[0], length: k, name: `飞机带单牌 (${k}连飞)`, cards };
        }
      }
    }

    // 12. 飞机带对子翅膀 (k组三张 + k个对子，总牌数 5*k)
    if (len >= 10 && len % 5 === 0) {
      const k = len / 5;
      const candidateTriples = [...triples, ...fours].filter(v => v < 15).sort((a, b) => a - b);
      for (let i = 0; i <= candidateTriples.length - k; i++) {
        const sub = candidateTriples.slice(i, i + k);
        if (isContinuous(sub)) {
          let wingsCount = 0;
          for (const [val, count] of rankCounts.entries()) {
            if (!sub.includes(val)) {
              if (count === 2) wingsCount += 1;
              else if (count === 4) wingsCount += 2;
            }
          }
          if (wingsCount === k) {
            return { type: CARD_TYPES.AIRPLANE_PAIRS, value: sub[0], length: k, name: `飞机带对子 (${k}连飞)`, cards };
          }
        }
      }
    }

    // 13. 四带二单 (6张：4同点 + 任意2张单牌或1对)
    if (len === 6 && fours.length === 1) {
      return { type: CARD_TYPES.FOUR_TWO_SINGLES, value: fours[0], length: 6, name: `四带二单 (${getRankName(fours[0])})`, cards };
    }

    // 14. 四带两对 (8张：4同点 + 2对)
    if (len === 8 && fours.length >= 1) {
      for (const fVal of fours) {
        let otherPairs = 0;
        for (const [val, count] of rankCounts.entries()) {
          if (val !== fVal) {
            if (count === 2) otherPairs += 1;
            else if (count === 4) otherPairs += 2;
          }
        }
        if (otherPairs === 2) {
          return { type: CARD_TYPES.FOUR_TWO_PAIRS, value: fVal, length: 8, name: `四带两对 (${getRankName(fVal)})`, cards };
        }
      }
    }

    return { type: CARD_TYPES.INVALID, value: 0, length: 0, name: '不符合牌型' };
  }

  /**
   * 判断手牌是否能压过桌面的牌
   * @param {Object} candidate 手牌解析结果
   * @param {Object|null} table 桌面上当前的有效牌解析结果
   * @returns {boolean}
   */
  function canBeat(candidate, table) {
    if (!candidate || candidate.type === CARD_TYPES.INVALID) return false;
    if (!table || table.type === CARD_TYPES.INVALID) return true;

    // 1. 王炸秒杀一切
    if (candidate.type === CARD_TYPES.ROCKET) return true;
    if (table.type === CARD_TYPES.ROCKET) return false;

    // 2. 炸弹压制非炸弹
    if (candidate.type === CARD_TYPES.BOMB) {
      if (table.type !== CARD_TYPES.BOMB) return true;
      return candidate.value > table.value;
    }

    // 3. 非炸弹必须牌型一致、长度一致且主牌点数更大
    if (candidate.type === table.type && candidate.length === table.length) {
      return candidate.value > table.value;
    }

    return false;
  }

  /**
   * 智能提示：在手牌中找出所有能压过桌面的合法出牌组合
   * @param {Array} myCards 玩家当前手牌
   * @param {Object|null} tableHand 当前桌面的牌型
   * @returns {Array<Array>} 可出牌的卡牌对象数组列表（按牌面点数从小到大排序）
   */
  function findBeatingHands(myCards, tableHand) {
    if (!myCards || myCards.length === 0) return [];

    const sorted = sortCards(myCards);
    const rankCounts = getRankCounts(sorted);
    const distinctVals = Array.from(rankCounts.keys()).sort((a, b) => a - b);
    const results = [];

    function pickCards(val, count, excludeIds = new Set()) {
      const picked = [];
      for (const c of sorted) {
        if (c.value === val && !excludeIds.has(c.id)) {
          picked.push(c);
          if (picked.length === count) break;
        }
      }
      return picked.length === count ? picked : null;
    }

    // 1. 如果桌面为空（主动出牌轮），推荐单顺、双顺、三张、对子或最小单张
    if (!tableHand || tableHand.type === CARD_TYPES.INVALID) {
      // 检查是否有顺子
      for (let len = 12; len >= 5; len--) {
        for (let s = 3; s <= 14 - len + 1; s++) {
          let hasStraight = true;
          const combo = [];
          for (let i = 0; i < len; i++) {
            const v = s + i;
            if (!rankCounts.has(v) || rankCounts.get(v) < 1) {
              hasStraight = false;
              break;
            }
            combo.push(...pickCards(v, 1));
          }
          if (hasStraight) {
            results.push(combo);
            break;
          }
        }
        if (results.length > 0) break;
      }

      // 检查连对
      for (let s = 3; s <= 12; s++) {
        let hasPairs = true;
        const combo = [];
        for (let i = 0; i < 3; i++) {
          const v = s + i;
          if (!rankCounts.has(v) || rankCounts.get(v) < 2) {
            hasPairs = false;
            break;
          }
          combo.push(...pickCards(v, 2));
        }
        if (hasPairs) {
          results.push(combo);
          break;
        }
      }

      // 推荐最小三带一
      const minTripleVal = distinctVals.find(v => rankCounts.get(v) >= 3);
      if (minTripleVal) {
        const trip = pickCards(minTripleVal, 3);
        const otherSingle = distinctVals.find(v => v !== minTripleVal && rankCounts.get(v) >= 1);
        if (otherSingle) {
          results.push([...trip, ...pickCards(otherSingle, 1)]);
        } else {
          results.push(trip);
        }
      }

      // 推荐最小对子
      const minPairVal = distinctVals.find(v => rankCounts.get(v) >= 2);
      if (minPairVal) results.push(pickCards(minPairVal, 2));

      // 推荐最小单张
      if (distinctVals.length > 0) {
        results.push(pickCards(distinctVals[0], 1));
      }

      return results.filter(Boolean);
    }

    // 2. 针对桌面牌型寻找同类压制牌
    switch (tableHand.type) {
      case CARD_TYPES.SINGLE: {
        for (const v of distinctVals) {
          if (v > tableHand.value) {
            results.push(pickCards(v, 1));
          }
        }
        break;
      }
      case CARD_TYPES.PAIR: {
        for (const v of distinctVals) {
          if (v > tableHand.value && rankCounts.get(v) >= 2) {
            results.push(pickCards(v, 2));
          }
        }
        break;
      }
      case CARD_TYPES.TRIPLE: {
        for (const v of distinctVals) {
          if (v > tableHand.value && rankCounts.get(v) >= 3) {
            results.push(pickCards(v, 3));
          }
        }
        break;
      }
      case CARD_TYPES.TRIPLE_ONE: {
        for (const v of distinctVals) {
          if (v > tableHand.value && rankCounts.get(v) >= 3) {
            const trip = pickCards(v, 3);
            const exclude = new Set(trip.map(c => c.id));
            for (const sv of distinctVals) {
              if (sv !== v) {
                const single = pickCards(sv, 1, exclude);
                if (single) {
                  results.push([...trip, ...single]);
                  break;
                }
              }
            }
          }
        }
        break;
      }
      case CARD_TYPES.TRIPLE_PAIR: {
        for (const v of distinctVals) {
          if (v > tableHand.value && rankCounts.get(v) >= 3) {
            const trip = pickCards(v, 3);
            const exclude = new Set(trip.map(c => c.id));
            for (const pv of distinctVals) {
              if (pv !== v && rankCounts.get(pv) >= 2) {
                const pair = pickCards(pv, 2, exclude);
                if (pair) {
                  results.push([...trip, ...pair]);
                  break;
                }
              }
            }
          }
        }
        break;
      }
      case CARD_TYPES.STRAIGHT: {
        const len = tableHand.length;
        for (let startVal = tableHand.value + 1; startVal <= 14 - len + 1; startVal++) {
          let ok = true;
          const combo = [];
          for (let i = 0; i < len; i++) {
            const val = startVal + i;
            if (!rankCounts.has(val) || rankCounts.get(val) < 1) {
              ok = false;
              break;
            }
            combo.push(...pickCards(val, 1));
          }
          if (ok) results.push(combo);
        }
        break;
      }
      case CARD_TYPES.STRAIGHT_PAIRS: {
        const pairCount = tableHand.length;
        for (let startVal = tableHand.value + 1; startVal <= 14 - pairCount + 1; startVal++) {
          let ok = true;
          const combo = [];
          for (let i = 0; i < pairCount; i++) {
            const val = startVal + i;
            if (!rankCounts.has(val) || rankCounts.get(val) < 2) {
              ok = false;
              break;
            }
            combo.push(...pickCards(val, 2));
          }
          if (ok) results.push(combo);
        }
        break;
      }
      case CARD_TYPES.BOMB: {
        for (const v of distinctVals) {
          if (v > tableHand.value && rankCounts.get(v) === 4) {
            results.push(pickCards(v, 4));
          }
        }
        break;
      }
    }

    // 3. 炸弹和王炸作为备选压制
    if (tableHand.type !== CARD_TYPES.ROCKET) {
      if (tableHand.type !== CARD_TYPES.BOMB) {
        for (const v of distinctVals) {
          if (rankCounts.get(v) === 4) {
            results.push(pickCards(v, 4));
          }
        }
      }
      if (rankCounts.has(16) && rankCounts.has(17)) {
        results.push([
          ...pickCards(16, 1),
          ...pickCards(17, 1)
        ]);
      }
    }

    return results.filter(r => r && r.length > 0);
  }

  return {
    SUITS,
    RANKS,
    RANK_VALUES,
    CARD_TYPES,
    CARD_TYPE_NAMES,
    createDeck,
    sortCards,
    getRankCounts,
    getRankName,
    parseHand,
    canBeat,
    findBeatingHands
  };
});
