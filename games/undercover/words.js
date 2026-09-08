// 谁是卧底 - 词库与惩罚库
const wordCategories = {
  classic: {
    name: '经典对决',
    icon: '⚔️',
    words: [
      { civilian: '状元', undercover: '榜眼' },
      { civilian: '玫瑰', undercover: '月季' },
      { civilian: '麦当劳', undercover: '肯德基' },
      { civilian: '微信', undercover: 'QQ' },
      { civilian: '橙子', undercover: '橘子' },
      { civilian: '眉毛', undercover: '胡须' },
      { civilian: '蝴蝶', undercover: '蜻蜓' },
      { civilian: '烤肉', undercover: '涮肉' },
      { civilian: '警察', undercover: '保安' },
      { civilian: '纸巾', undercover: '手帕' },
      { civilian: '丑小鸭', undercover: '灰姑娘' },
      { civilian: '牛奶', undercover: '豆浆' },
      { civilian: '口红', undercover: '唇膏' },
      { civilian: '散文', undercover: '小说' },
      { civilian: '泡泡糖', undercover: '棒棒糖' },
      { civilian: '摩托车', undercover: '电动车' },
      { civilian: '水盆', undercover: '水桶' },
      { civilian: '太监', undercover: '人妖' },
      { civilian: '魔术师', undercover: '催眠师' },
      { civilian: '围巾', undercover: '围脖' },
      { civilian: '自行车', undercover: '三轮车' },
      { civilian: '相声', undercover: '小品' },
      { civilian: '辣椒', undercover: '芥末' },
      { civilian: '作家', undercover: '编剧' },
      { civilian: '童话', undercover: '神话' },
      { civilian: '牛肉干', undercover: '猪肉脯' },
      { civilian: '羽毛球', undercover: '网球' },
      { civilian: '面包', undercover: '蛋糕' },
      { civilian: '吉他', undercover: '尤克里里' },
      { civilian: '风扇', undercover: '空调' }
    ]
  },
  life: {
    name: '生活日常',
    icon: '☕',
    words: [
      { civilian: '自习室', undercover: '图书馆' },
      { civilian: '外卖', undercover: '堂食' },
      { civilian: '奶茶', undercover: '咖啡' },
      { civilian: '辣条', undercover: '薯片' },
      { civilian: '拖延症', undercover: '强迫症' },
      { civilian: '火锅', undercover: '串串香' },
      { civilian: '洗发水', undercover: '沐浴露' },
      { civilian: '眼药水', undercover: '隐形眼镜' },
      { civilian: '被子', undercover: '毯子' },
      { civilian: '筷子', undercover: '勺子' },
      { civilian: '牙刷', undercover: '牙线' },
      { civilian: '耳机', undercover: '音箱' },
      { civilian: '充电宝', undercover: '充电头' },
      { civilian: '拖鞋', undercover: '凉鞋' },
      { civilian: '枕头', undercover: '抱枕' },
      { civilian: '口罩', undercover: '面罩' },
      { civilian: '雨伞', undercover: '雨衣' },
      { civilian: '镜子', undercover: '玻璃' },
      { civilian: '公交车', undercover: '地铁' },
      { civilian: '高铁', undercover: '飞机' }
    ]
  },
  fun: {
    name: '搞笑扎心',
    icon: '🤣',
    words: [
      { civilian: '前男友', undercover: '现男友' },
      { civilian: '相亲', undercover: '约会' },
      { civilian: '穷光蛋', undercover: '富二代' },
      { civilian: '加班', undercover: '熬夜' },
      { civilian: '秃顶', undercover: '掉发' },
      { civilian: '假发', undercover: '假睫毛' },
      { civilian: '借钱', undercover: '还钱' },
      { civilian: '减肥', undercover: '节食' },
      { civilian: '单身狗', undercover: '加班狗' },
      { civilian: '发朋友圈', undercover: '发微博' },
      { civilian: '锦鲤', undercover: '咸鱼' },
      { civilian: '素颜', undercover: '裸妆' },
      { civilian: '网恋', undercover: '奔现' },
      { civilian: '打工人', undercover: '干饭人' },
      { civilian: '凡尔赛', undercover: '吹牛' },
      { civilian: '社恐', undercover: '宅男' },
      { civilian: '摸鱼', undercover: '偷懒' },
      { civilian: 'AA制', undercover: '抢买单' }
    ]
  },
  pop: {
    name: '影视动漫',
    icon: '🎬',
    words: [
      { civilian: '甄嬛传', undercover: '延禧攻略' },
      { civilian: '孙悟空', undercover: '猪八戒' },
      { civilian: '蜘蛛侠', undercover: '蝙蝠侠' },
      { civilian: '钢铁侠', undercover: '美国队长' },
      { civilian: '名侦探柯南', undercover: '金田一' },
      { civilian: '泰坦尼克号', undercover: '阿凡达' },
      { civilian: '流浪地球', undercover: '星际穿越' },
      { civilian: '哆啦A梦', undercover: '大雄' },
      { civilian: '鸣人', undercover: '佐助' },
      { civilian: '白娘子', undercover: '小青' },
      { civilian: '东方不败', undercover: '岳不群' },
      { civilian: '哈利波特', undercover: '伏地魔' },
      { civilian: '奥特曼', undercover: '怪兽' },
      { civilian: '喜羊羊', undercover: '灰太狼' }
    ]
  },
  food: {
    name: '吃货天下',
    icon: '🍔',
    words: [
      { civilian: '煎饼果子', undercover: '手抓饼' },
      { civilian: '螺蛳粉', undercover: '酸辣粉' },
      { civilian: '烤冷面', undercover: '炒年糕' },
      { civilian: '小笼包', undercover: '灌汤包' },
      { civilian: '羊肉串', undercover: '烤面筋' },
      { civilian: '榴莲', undercover: '臭豆腐' },
      { civilian: '可乐', undercover: '雪碧' },
      { civilian: '珍珠奶茶', undercover: '烧仙草' },
      { civilian: '麻辣烫', undercover: '冒菜' },
      { civilian: '冰淇淋', undercover: '雪糕' },
      { civilian: '水饺', undercover: '馄饨' },
      { civilian: '蛋挞', undercover: '泡芙' }
    ]
  }
};

// 趣味大冒险与真心话惩罚库
const punishments = [
  '🎙️ 用最嗲的声音说一句：“哥哥/姐姐，给人家点个赞嘛~”',
  '🦁 模仿三种不同动物的叫声（要逼真！）',
  '💃 现场跳一段搞怪魔性舞蹈（15秒）',
  '🗣️ 用方言深情朗诵：“鹅鹅鹅，曲项向天歌”',
  '📸 摆出三个极度夸张的搞怪表情供大家拍照留念',
  '🥤 喝一大口水/饮料并含住，听大家讲笑话坚持10秒不喷',
  '❤️ 真心话：在场的人中，谁的第一印象和现在反差最大？',
  '💪 做5个标准的深蹲或俯卧撑',
  '🤐 接下来的一整局游戏中，说话必须以“报告长官”开头',
  '🤖 模仿机器人说话的语气和动作持续30秒',
  '👑 夸奖在座的每一个人一句，不能重复词语',
  '🎭 假装自己赢了1000万大奖，发表即兴获奖感言'
];

module.exports = {
  wordCategories,
  punishments,
  getRandomWordPair: function(category = 'all', customList = []) {
    let pool = [];
    if (customList && customList.length > 0) {
      pool = [...customList];
    }
    if (pool.length === 0 || category !== 'custom_only') {
      if (category === 'all' || !wordCategories[category]) {
        Object.values(wordCategories).forEach(cat => {
          pool.push(...cat.words);
        });
      } else {
        pool.push(...wordCategories[category].words);
      }
    }
    if (pool.length === 0) {
      return { civilian: '苹果', undercover: '鸭梨' };
    }
    const selected = pool[Math.floor(Math.random() * pool.length)];
    // 50% 几率随机互换平民和卧底词，增加重复可玩性
    if (Math.random() > 0.5) {
      return { civilian: selected.undercover, undercover: selected.civilian };
    }
    return { ...selected };
  },
  getRandomPunishment: function() {
    return punishments[Math.floor(Math.random() * punishments.length)];
  }
};
