// 四川麻将（血战到底 / 血流成河）核心规则与算法引擎
// 包含：108张牌生成、定缺、换三张、碰杠胡检测、递归拆面子算番、听牌推导与查叫查花猪

const SUITS = {
  WAN: 'wan',   // 万字
  TONG: 'tong', // 筒子 (饼)
  TIAO: 'tiao'  // 条子 (索)
};

const SUIT_NAMES = {
  wan: '万',
  tong: '筒',
  tiao: '条'
};

// 生成标准四川麻将 108 张牌（无风字、箭牌、花牌）
function createDeck() {
  const deck = [];
  let id = 1;
  const suits = [SUITS.WAN, SUITS.TONG, SUITS.TIAO];

  for (const suit of suits) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let i = 0; i < 4; i++) {
        deck.push({
          id: id++,
          suit,
          rank,
          key: `${suit}_${rank}`
        });
      }
    }
  }
  return deck;
}

// 洗牌算法 (Fisher-Yates)
function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 扑克牌理牌排序 (按 万 -> 筒 -> 条，同花色按点数 1~9 升序)
function sortTiles(tiles) {
  const suitOrder = { [SUITS.WAN]: 1, [SUITS.TONG]: 2, [SUITS.TIAO]: 3 };
  return [...tiles].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return a.rank - b.rank;
  });
}

// 检查是否包含定缺花色
function hasQueSuit(tiles, queSuit) {
  if (!queSuit) return false;
  return tiles.some(t => t.suit === queSuit);
}

// 统计手牌各花色张数 (用于定缺推荐、查花猪)
function countSuits(tiles) {
  const counts = { [SUITS.WAN]: 0, [SUITS.TONG]: 0, [SUITS.TIAO]: 0 };
  for (const t of tiles) {
    if (counts[t.suit] !== undefined) counts[t.suit]++;
  }
  return counts;
}

// 智能推荐定缺花色 (手牌中最少张数的一门)
function recommendQueSuit(tiles) {
  const counts = countSuits(tiles);
  let minSuit = SUITS.WAN;
  let minCount = counts[SUITS.WAN];

  for (const s of [SUITS.TONG, SUITS.TIAO]) {
    if (counts[s] < minCount) {
      minCount = counts[s];
      minSuit = s;
    }
  }
  return minSuit;
}

// 辅助函数：将牌列表转为花色计数字典 { wan: [0..9], tong: [0..9], tiao: [0..9] }
function tilesToCountMap(tiles) {
  const map = {
    [SUITS.WAN]: new Array(10).fill(0),
    [SUITS.TONG]: new Array(10).fill(0),
    [SUITS.TIAO]: new Array(10).fill(0)
  };
  for (const t of tiles) {
    if (map[t.suit] && t.rank >= 1 && t.rank <= 9) {
      map[t.suit][t.rank]++;
    }
  }
  return map;
}

// 检查某个单门花色的牌是否可以全部拆解为顺子(ABC)和刻子(AAA)
function canMeldSuit(counts, totalTiles) {
  if (totalTiles === 0) return true;
  if (totalTiles % 3 !== 0) return false;

  const temp = [...counts];
  return backtrackMelds(temp);
}

function backtrackMelds(counts) {
  // 找到第一个有牌的点数
  let idx = 1;
  while (idx <= 9 && counts[idx] === 0) idx++;
  if (idx > 9) return true; // 所有牌均成功组成面子

  // 1. 尝试组成刻子 (AAA)
  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    if (backtrackMelds(counts)) return true;
    counts[idx] += 3;
  }

  // 2. 尝试组成顺子 (ABC)
  if (idx <= 7 && counts[idx] >= 1 && counts[idx + 1] >= 1 && counts[idx + 2] >= 1) {
    counts[idx]--;
    counts[idx + 1]--;
    counts[idx + 2]--;
    if (backtrackMelds(counts)) return true;
    counts[idx]++;
    counts[idx + 1]++;
    counts[idx + 2]++;
  }

  return false;
}

// 检查某个单门花色是否可以拆解为：一个雀头(对子 DD) + 若干面子 (AAA / ABC)
function canMeldSuitWithPair(counts, totalTiles) {
  if (totalTiles < 2 || (totalTiles - 2) % 3 !== 0) return false;

  const temp = [...counts];
  for (let r = 1; r <= 9; r++) {
    if (temp[r] >= 2) {
      // 提取雀头
      temp[r] -= 2;
      if (canMeldSuit(temp, totalTiles - 2)) {
        return true;
      }
      temp[r] += 2;
    }
  }
  return false;
}

// 核心胡牌检测：基本胡牌型 (3n + 2，必须缺一门，即花色门数 <= 2)
function checkNormalHu(tiles, queSuit) {
  if (hasQueSuit(tiles, queSuit)) return false;
  const countMap = tilesToCountMap(tiles);
  const suitTotals = {
    [SUITS.WAN]: tiles.filter(t => t.suit === SUITS.WAN).length,
    [SUITS.TONG]: tiles.filter(t => t.suit === SUITS.TONG).length,
    [SUITS.TIAO]: tiles.filter(t => t.suit === SUITS.TIAO).length
  };

  const suits = [SUITS.WAN, SUITS.TONG, SUITS.TIAO];

  // 必须有一个花色包含雀头 (余数 2)，其余花色必须整除 3 (余数 0)
  for (const pairSuit of suits) {
    if (suitTotals[pairSuit] % 3 !== 2) continue;

    // 其余两门必须都是 3 的倍数
    const otherSuits = suits.filter(s => s !== pairSuit);
    if (suitTotals[otherSuits[0]] % 3 !== 0 || suitTotals[otherSuits[1]] % 3 !== 0) continue;

    // 验证雀头门是否成立
    if (!canMeldSuitWithPair(countMap[pairSuit], suitTotals[pairSuit])) continue;

    // 验证另外两门是否都能拆解为面子
    if (!canMeldSuit(countMap[otherSuits[0]], suitTotals[otherSuits[0]])) continue;
    if (!canMeldSuit(countMap[otherSuits[1]], suitTotals[otherSuits[1]])) continue;

    return true;
  }

  return false;
}

// 核心胡牌检测：七对胡牌型 (无碰杠，共 14 张牌，恰好 7 个对子)
function checkSevenPairs(tiles, melds, queSuit) {
  if (melds && melds.length > 0) return false; // 七对必须门清不能有碰杠
  if (tiles.length !== 14) return false;
  if (hasQueSuit(tiles, queSuit)) return false;

  const countMap = tilesToCountMap(tiles);
  let pairs = 0;

  for (const suit of [SUITS.WAN, SUITS.TONG, SUITS.TIAO]) {
    for (let r = 1; r <= 9; r++) {
      const c = countMap[suit][r];
      if (c === 2) pairs += 1;
      else if (c === 4) pairs += 2; // 含有根 (龙七对)
      else if (c !== 0) return false; // 必须是偶数
    }
  }

  return pairs === 7;
}

// 综合胡牌判断入口：检测当前手牌是否胡牌
function canHu(handCards, melds = [], queSuit = null) {
  if (hasQueSuit(handCards, queSuit)) return false;
  if (checkSevenPairs(handCards, melds, queSuit)) return true;
  return checkNormalHu(handCards, queSuit);
}

// 统计手牌和副露中的“根”数 (四张完全相同的牌，不论碰/杠与否，每根额外加 1 番)
function countGens(handCards, melds = []) {
  const totalTiles = [...handCards];
  for (const m of melds) {
    if (m.tiles) totalTiles.push(...m.tiles);
  }

  const map = {};
  for (const t of totalTiles) {
    const k = `${t.suit}_${t.rank}`;
    map[k] = (map[k] || 0) + 1;
  }

  let gens = 0;
  for (const k in map) {
    if (map[k] === 4) gens++;
  }
  return gens;
}

// 检查是否为“清一色” (所有手牌和副露属于同一花色)
function isQingYiSe(handCards, melds = []) {
  const all = [...handCards];
  for (const m of melds) {
    if (m.tiles) all.push(...m.tiles);
  }
  if (all.length === 0) return false;
  const firstSuit = all[0].suit;
  return all.every(t => t.suit === firstSuit);
}

// 检查是否为“对对胡 (碰碰胡)” (除雀头外全由刻子/杠组成)
function isDuiDuiHu(handCards, melds = []) {
  // 若有吃了顺子则必然不是对对胡 (四川麻将无吃，但保障算法通用性)
  for (const m of melds) {
    if (m.type === 'chi') return false;
  }

  const countMap = tilesToCountMap(handCards);
  let pairCount = 0;

  for (const s of [SUITS.WAN, SUITS.TONG, SUITS.TIAO]) {
    for (let r = 1; r <= 9; r++) {
      const c = countMap[s][r];
      if (c === 2) pairCount++;
      else if (c === 3) { /* 刻子 OK */ }
      else if (c === 1 || c === 4) {
        // 如果手牌中有 4 张但未杠，且不是碰碰胡的一刻+一单
        return false;
      }
    }
  }

  return pairCount === 1;
}

// 检查是否为“金钩钓 (单钓将)” (碰/杠了 4 组牌，手里只剩最后 1 张单钓胡牌)
function isJinGouDiao(handCards) {
  return handCards.length === 2; // 14张牌时手里剩2张 (即钓中的那张+原先手牌里的单张)
}

// 四川麻将专业算番引擎 (倍数 = 2^番数)
function calculateFan({
  handCards,
  melds = [],
  queSuit = null,
  isZimo = false,
  isGangShangHua = false,
  isGangShangPao = false,
  isQiangGang = false,
  isHaiDi = false,
  isTianHu = false,
  isDiHu = false
}) {
  const fans = [];
  let totalFan = 0;

  const qingyise = isQingYiSe(handCards, melds);
  const sevenPairs = checkSevenPairs(handCards, melds, queSuit);
  const duiduihu = !sevenPairs && isDuiDuiHu(handCards, melds);
  const jingoudiao = isJinGouDiao(handCards);
  const gens = countGens(handCards, melds);

  if (isTianHu) {
    fans.push({ name: '天胡', fan: 5 });
    totalFan += 5;
  } else if (isDiHu) {
    fans.push({ name: '地胡', fan: 4 });
    totalFan += 4;
  }

  if (qingyise && sevenPairs) {
    fans.push({ name: '清七对', fan: 5 });
    totalFan += 5;
  } else if (qingyise && duiduihu) {
    fans.push({ name: '清对', fan: 4 });
    totalFan += 4;
  } else if (qingyise) {
    fans.push({ name: '清一色', fan: 3 }); // 3番 (8倍) 或 4番
    totalFan += 3;
  } else if (sevenPairs) {
    fans.push({ name: '七对', fan: 3 });
    totalFan += 3;
  } else if (duiduihu) {
    fans.push({ name: '对对胡', fan: 2 });
    totalFan += 2;
  } else {
    fans.push({ name: '平胡', fan: 1 });
    totalFan += 1;
  }

  if (jingoudiao) {
    fans.push({ name: '金钩钓', fan: 1 });
    totalFan += 1;
  }

  // 根数加番 (每根 +1 番)
  if (gens > 0) {
    fans.push({ name: `带${gens}根`, fan: gens });
    totalFan += gens;
  }

  // 牌局附加特技番
  if (isGangShangHua) {
    fans.push({ name: '杠上开花', fan: 1 });
    totalFan += 1;
  }
  if (isGangShangPao) {
    fans.push({ name: '杠上炮', fan: 1 });
    totalFan += 1;
  }
  if (isQiangGang) {
    fans.push({ name: '抢杠胡', fan: 1 });
    totalFan += 1;
  }
  if (isHaiDi) {
    fans.push({ name: '海底捞月', fan: 1 });
    totalFan += 1;
  }
  if (isZimo) {
    fans.push({ name: '自摸', fan: 1 });
    totalFan += 1;
  }

  return {
    fans,
    totalFan,
    multiplier: Math.pow(2, totalFan)
  };
}

// 检查是否可碰：别人出牌 tile，我手牌中有 >= 2 张且非定缺色
function canPeng(handCards, tile, queSuit) {
  if (tile.suit === queSuit) return false;
  const matchCount = handCards.filter(t => t.suit === tile.suit && t.rank === tile.rank).length;
  return matchCount >= 2;
}

// 检查是否可直杠 (明杠/刮风)：别人出牌 tile，我手牌中有 3 张且非定缺色
function canZhiGang(handCards, tile, queSuit) {
  if (tile.suit === queSuit) return false;
  const matchCount = handCards.filter(t => t.suit === tile.suit && t.rank === tile.rank).length;
  return matchCount === 3;
}

// 检查自己摸牌后是否可以暗杠 (手牌中有 4 张相同牌) 或弯杠 (碰过的牌摸到第 4 张)
function findMyGangs(handCards, melds = [], queSuit) {
  const gangs = [];

  // 1. 查找暗杠 (下雨)
  const countMap = {};
  for (const t of handCards) {
    if (t.suit === queSuit) continue;
    const k = `${t.suit}_${t.rank}`;
    countMap[k] = (countMap[k] || 0) + 1;
  }

  for (const k in countMap) {
    if (countMap[k] === 4) {
      const [suit, rankStr] = k.split('_');
      gangs.push({
        type: 'an_gang',
        suit,
        rank: Number(rankStr),
        name: `暗杠 [${rankStr}${SUIT_NAMES[suit]}]`
      });
    }
  }

  // 2. 查找弯杠 / 补杠 (碰过的牌再摸一张)
  for (const m of melds) {
    if (m.type === 'peng') {
      const match = handCards.find(t => t.suit === m.suit && t.rank === m.rank);
      if (match) {
        gangs.push({
          type: 'wan_gang',
          suit: m.suit,
          rank: m.rank,
          name: `补杠 [${m.rank}${SUIT_NAMES[m.suit]}]`
        });
      }
    }
  }

  return gangs;
}

// 智能听牌检测：在 13 张手牌下（或打了某张牌后），遍历所有牌看胡哪几张牌及对应番数
function getTingInfo(handCards, melds = [], queSuit = null) {
  if (hasQueSuit(handCards, queSuit)) {
    return { isTing: false, huTiles: [] };
  }

  const huTiles = [];
  const suits = [SUITS.WAN, SUITS.TONG, SUITS.TIAO].filter(s => s !== queSuit);

  for (const suit of suits) {
    for (let rank = 1; rank <= 9; rank++) {
      const testTile = { id: 9999, suit, rank, key: `${suit}_${rank}` };
      const simulatedHand = [...handCards, testTile];

      if (canHu(simulatedHand, melds, queSuit)) {
        const fanInfo = calculateFan({ handCards: simulatedHand, melds, queSuit, isZimo: false });
        huTiles.push({
          suit,
          rank,
          key: `${suit}_${rank}`,
          fan: fanInfo.totalFan,
          multiplier: fanInfo.multiplier
        });
      }
    }
  }

  return {
    isTing: huTiles.length > 0,
    huTiles
  };
}

// 智能出牌听牌分析推荐：当前有 14 张牌，推荐打哪张牌后可以听牌
function analyzeDiscardsForTing(handCards, melds = [], queSuit = null) {
  // 如果有定缺牌，必须先打定缺牌
  const queTiles = handCards.filter(t => t.suit === queSuit);
  if (queTiles.length > 0) {
    return {
      mustDiscardQue: true,
      queTiles
    };
  }

  const recommendations = [];
  const checkedKeys = new Set();

  for (let i = 0; i < handCards.length; i++) {
    const tileToDiscard = handCards[i];
    const key = tileToDiscard.key;
    if (checkedKeys.has(key)) continue;
    checkedKeys.add(key);

    const remainingHand = handCards.filter((_, idx) => idx !== i);
    const tingResult = getTingInfo(remainingHand, melds, queSuit);

    if (tingResult.isTing) {
      recommendations.push({
        discardTile: tileToDiscard,
        tingCount: tingResult.huTiles.length,
        huTiles: tingResult.huTiles
      });
    }
  }

  // 按听牌张数和最大番数由大到小排序
  recommendations.sort((a, b) => b.tingCount - a.tingCount);

  return {
    mustDiscardQue: false,
    recommendations
  };
}

module.exports = {
  SUITS,
  SUIT_NAMES,
  createDeck,
  shuffle,
  sortTiles,
  hasQueSuit,
  countSuits,
  recommendQueSuit,
  canHu,
  calculateFan,
  canPeng,
  canZhiGang,
  findMyGangs,
  getTingInfo,
  analyzeDiscardsForTing
};
