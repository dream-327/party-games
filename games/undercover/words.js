// 谁是卧底 - 核心词库与惩罚库
const wordCategories = {
  classic: {
    name: '经典对决',
    icon: '⚔️',
    words: [
      { civilian: '眉毛', undercover: '睫毛' },
      { civilian: '保姆', undercover: '月嫂' },
      { civilian: '自行车', undercover: '平衡车' },
      { civilian: '洗发露', undercover: '护发素' },
      { civilian: '近视镜', undercover: '老花镜' },
      { civilian: '双胞胎', undercover: '克隆人' },
      { civilian: '相声', undercover: '小品' },
      { civilian: '辣椒', undercover: '芥末' },
      { civilian: '作家', undercover: '编剧' },
      { civilian: '童话', undercover: '寓言' },
      { civilian: '羽毛球', undercover: '网球' },
      { civilian: '吉他', undercover: '尤克里里' },
      { civilian: '风扇', undercover: '空调扇' },
      { civilian: '毛衣', undercover: '针织衫' },
      { civilian: '围巾', undercover: '披肩' },
      { civilian: '魔术师', undercover: '催眠师' },
      { civilian: '气球', undercover: '泡泡' },
      { civilian: '牛奶', undercover: '豆浆' },
      { civilian: '牛肉干', undercover: '猪肉脯' },
      { civilian: '玫瑰', undercover: '月季' },
      { civilian: '保安', undercover: '保镖' },
      { civilian: '相亲', undercover: '联谊' },
      { civilian: '雨伞', undercover: '太阳伞' },
      { civilian: '散文', undercover: '诗歌' },
      { civilian: '丑小鸭', undercover: '灰姑娘' },
      { civilian: '水盆', undercover: '水桶' },
      { civilian: '口红', undercover: '润唇膏' },
      { civilian: '班主任', undercover: '辅导员' },
      { civilian: '麦当劳', undercover: '肯德基' },
      { civilian: '微信', undercover: 'QQ' },
      { civilian: '警察', undercover: '便衣' },
      { civilian: '面包', undercover: '馒头' },
      { civilian: '橘子', undercover: '芦柑' },
      { civilian: '皮影戏', undercover: '木偶戏' },
      { civilian: '红娘', undercover: '媒婆' },
      { civilian: '乒乓球', undercover: '羽毛球' }
    ]
  },
  life: {
    name: '生活日常',
    icon: '☕',
    words: [
      { civilian: '充电宝', undercover: '蓄电池' },
      { civilian: '保温杯', undercover: '保温壶' },
      { civilian: '加湿器', undercover: '喷雾补水仪' },
      { civilian: '扫地机器人', undercover: '吸尘器' },
      { civilian: '蓝牙耳机', undercover: '降噪耳机' },
      { civilian: '平板电脑', undercover: '电纸书' },
      { civilian: '单反相机', undercover: '微单相机' },
      { civilian: '机械键盘', undercover: '薄膜键盘' },
      { civilian: '洗面奶', undercover: '卸妆油' },
      { civilian: '爽肤水', undercover: '精华液' },
      { civilian: '眼霜', undercover: '面霜' },
      { civilian: '毛巾', undercover: '浴巾' },
      { civilian: '香皂', undercover: '硫磺皂' },
      { civilian: '洗衣液', undercover: '洗衣凝珠' },
      { civilian: '洗洁精', undercover: '洗手液' },
      { civilian: '防晒霜', undercover: '隔离霜' },
      { civilian: '热水袋', undercover: '暖宝宝' },
      { civilian: '羽绒服', undercover: '棉服' },
      { civilian: '卫衣', undercover: '帽衫' },
      { civilian: '风衣', undercover: '大衣' },
      { civilian: '马甲', undercover: '背心' },
      { civilian: '拖鞋', undercover: '凉鞋' },
      { civilian: '帆布鞋', undercover: '小白鞋' },
      { civilian: '公交车', undercover: '大巴车' },
      { civilian: '高铁', undercover: '动车' },
      { civilian: '自习室', undercover: '阅览室' },
      { civilian: '眼药水', undercover: '洗眼液' },
      { civilian: '牙刷', undercover: '电动牙刷' },
      { civilian: '牙线', undercover: '牙签' },
      { civilian: '枕头', undercover: '抱枕' },
      { civilian: '口罩', undercover: '面罩' },
      { civilian: '指甲刀', undercover: '修甲锉' },
      { civilian: '梳子', undercover: '发箍' },
      { civilian: '纸巾', undercover: '湿巾' },
      { civilian: '窗帘', undercover: '百叶窗' },
      { civilian: '电热毯', undercover: '水暖毯' }
    ]
  },
  fun: {
    name: '搞笑扎心',
    icon: '🤣',
    words: [
      { civilian: '打呼噜', undercover: '磨牙' },
      { civilian: '打嗝', undercover: '放屁' },
      { civilian: '梦游', undercover: '鬼压床' },
      { civilian: '发誓', undercover: '许愿' },
      { civilian: '私房钱', undercover: '压岁钱' },
      { civilian: 'AA制', undercover: '轮流请客' },
      { civilian: '加班', undercover: '值班' },
      { civilian: '辞职', undercover: '跳槽' },
      { civilian: '摸鱼', undercover: '划水' },
      { civilian: '假发', undercover: '发片' },
      { civilian: '网恋', undercover: '异地恋' },
      { civilian: '前任', undercover: '初恋' },
      { civilian: '买彩票', undercover: '刮刮乐' },
      { civilian: '剧透', undercover: '彩蛋' },
      { civilian: '自拍', undercover: '他拍' },
      { civilian: '肚皮舞', undercover: '钢管舞' },
      { civilian: '广场舞', undercover: '交谊舞' },
      { civilian: '减肥', undercover: '节食' },
      { civilian: '借钱', undercover: '催债' },
      { civilian: '锦鲤', undercover: '咸鱼' },
      { civilian: '凡尔赛', undercover: '装杯' },
      { civilian: '社恐', undercover: '内向' },
      { civilian: '外卖', undercover: '堂食' },
      { civilian: '相亲', undercover: '见家长' },
      { civilian: '发朋友圈', undercover: '发小红书' },
      { civilian: '喝假酒', undercover: '耍酒疯' },
      { civilian: '眼泪', undercover: '鼻涕' },
      { civilian: '熬夜', undercover: '通宵' },
      { civilian: '秃顶', undercover: '发际线后移' },
      { civilian: '打工人', undercover: '社畜' },
      { civilian: '吃瓜', undercover: '八卦' },
      { civilian: '网购', undercover: '逛街' },
      { civilian: '素颜', undercover: '裸妆' },
      { civilian: '抢红包', undercover: '发红包' },
      { civilian: '放鸽子', undercover: '爽约' },
      { civilian: '表白', undercover: '求婚' }
    ]
  },
  food: {
    name: '吃货天下',
    icon: '🍔',
    words: [
      { civilian: '元宵', undercover: '汤圆' },
      { civilian: '米线', undercover: '米粉' },
      { civilian: '生煎包', undercover: '锅贴' },
      { civilian: '小笼包', undercover: '灌汤包' },
      { civilian: '热干面', undercover: '炸酱面' },
      { civilian: '羊肉串', undercover: '烤面筋' },
      { civilian: '关东煮', undercover: '麻辣烫' },
      { civilian: '鸭脖', undercover: '鸭翅' },
      { civilian: '螺蛳粉', undercover: '酸辣粉' },
      { civilian: '煎饼果子', undercover: '手抓饼' },
      { civilian: '苏打水', undercover: '气泡水' },
      { civilian: '拿铁', undercover: '卡布奇诺' },
      { civilian: '双皮奶', undercover: '布丁' },
      { civilian: '蛋挞', undercover: '泡芙' },
      { civilian: '冰淇淋', undercover: '雪糕' },
      { civilian: '可乐', undercover: '雪碧' },
      { civilian: '珍珠奶茶', undercover: '烧仙草' },
      { civilian: '火锅', undercover: '串串香' },
      { civilian: '水饺', undercover: '馄饨' },
      { civilian: '烤冷面', undercover: '炒年糕' },
      { civilian: '炸鸡', undercover: '盐酥鸡' },
      { civilian: '大白兔奶糖', undercover: '阿尔卑斯' },
      { civilian: '榴莲', undercover: '菠萝蜜' },
      { civilian: '臭豆腐', undercover: '腐乳' },
      { civilian: '泡面', undercover: '干脆面' },
      { civilian: '提拉米苏', undercover: '黑森林' },
      { civilian: '芒果', undercover: '木瓜' },
      { civilian: '酸奶', undercover: '乳酸菌' },
      { civilian: '烤鸭', undercover: '烧鹅' },
      { civilian: '章鱼小丸子', undercover: '大阪烧' },
      { civilian: '豆花', undercover: '豆腐脑' },
      { civilian: '肉夹馍', undercover: '驴肉火烧' },
      { civilian: '辣条', undercover: '辣片' },
      { civilian: '鸭血粉丝汤', undercover: '羊肉泡馍' },
      { civilian: '烧烤', undercover: '铁板烧' },
      { civilian: '奶盖茶', undercover: '芝士茗茶' }
    ]
  },
  pop: {
    name: '影视娱乐',
    icon: '🎬',
    words: [
      { civilian: '盗墓笔记', undercover: '鬼吹灯' },
      { civilian: '金庸', undercover: '古龙' },
      { civilian: '甄嬛传', undercover: '延禧攻略' },
      { civilian: '名侦探柯南', undercover: '金田一' },
      { civilian: '流浪地球', undercover: '星际穿越' },
      { civilian: '哈利波特', undercover: '神奇动物' },
      { civilian: '周杰伦', undercover: '林俊杰' },
      { civilian: '西游记', undercover: '封神榜' },
      { civilian: '蜘蛛侠', undercover: '死侍' },
      { civilian: '钢铁侠', undercover: '蝙蝠侠' },
      { civilian: '孙悟空', undercover: '六耳猕猴' },
      { civilian: '白娘子', undercover: '小青' },
      { civilian: '东方不败', undercover: '任我行' },
      { civilian: '哆啦A梦', undercover: '大雄' },
      { civilian: '鸣人', undercover: '佐助' },
      { civilian: '泰坦尼克号', undercover: '阿凡达' },
      { civilian: '喜羊羊', undercover: '灰太狼' },
      { civilian: '熊大', undercover: '熊二' },
      { civilian: '刘德华', undercover: '张学友' },
      { civilian: '王菲', undercover: '那英' },
      { civilian: '复仇者联盟', undercover: '正义联盟' },
      { civilian: '小燕子', undercover: '紫薇' },
      { civilian: '李小龙', undercover: '成龙' },
      { civilian: '海贼王', undercover: '火影忍者' },
      { civilian: '猫和老鼠', undercover: '兔八哥' },
      { civilian: '白雪公主', undercover: '睡美人' },
      { civilian: '梁山伯与祝英台', undercover: '罗密欧与朱丽叶' },
      { civilian: '奥特曼', undercover: '假面骑士' },
      { civilian: '三国演义', undercover: '水浒传' },
      { civilian: '红楼梦', undercover: '西厢记' }
    ]
  },
  hardcore: {
    name: '烧脑进阶',
    icon: '🧠',
    words: [
      { civilian: '若即若离', undercover: '半推半就' },
      { civilian: '暗恋', undercover: '单相思' },
      { civilian: '自作多情', undercover: '一厢情愿' },
      { civilian: '成双成对', undercover: '形影不离' },
      { civilian: '眉来眼去', undercover: '暗送秋波' },
      { civilian: '偷天换日', undercover: '瞒天过海' },
      { civilian: '画蛇添足', undercover: '多此一举' },
      { civilian: '同甘共苦', undercover: '患难与共' },
      { civilian: '津津有味', undercover: '回味无穷' },
      { civilian: '胸有成竹', undercover: '十拿九稳' },
      { civilian: '异曲同工', undercover: '不谋而合' },
      { civilian: '语无伦次', undercover: '胡言乱语' },
      { civilian: '破涕为笑', undercover: '喜极而泣' },
      { civilian: '情不自禁', undercover: '不由自主' },
      { civilian: '神魂颠倒', undercover: '神魂魄散' },
      { civilian: '心惊肉跳', undercover: '胆战心惊' },
      { civilian: '目瞪口呆', undercover: '瞠目结舌' },
      { civilian: '忐忑不安', undercover: '七上八下' },
      { civilian: '理直气壮', undercover: '义正辞严' },
      { civilian: '掩耳盗铃', undercover: '自欺欺人' },
      { civilian: '临阵磨枪', undercover: '临渴掘井' },
      { civilian: '迫不及待', undercover: '急不可耐' },
      { civilian: '守株待兔', undercover: '刻舟求剑' },
      { civilian: '捕风捉影', undercover: '无中生有' },
      { civilian: '亡羊补牢', undercover: '未雨绸缪' },
      { civilian: '狐假虎威', undercover: '狗仗人势' },
      { civilian: '班门弄斧', undercover: '关公耍大刀' },
      { civilian: '井底之蛙', undercover: '坐井观天' },
      { civilian: '口是心非', undercover: '表里不一' },
      { civilian: '推心置腹', undercover: '肝胆相照' },
      { civilian: '举一反三', undercover: '触类旁通' },
      { civilian: '朝三暮四', undercover: '朝秦暮楚' },
      { civilian: '走马观花', undercover: '浮光掠影' },
      { civilian: '前事不忘', undercover: '后事之师' },
      { civilian: '锦上添花', undercover: '雪中送炭' },
      { civilian: '落井下石', undercover: '趁火打劫' }
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
  getRandomWordPair: function(category = 'all', customList = [], usedKeys = null) {
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

    let availablePool = pool;
    if (usedKeys) {
      const isUsed = (key) => (usedKeys instanceof Set ? usedKeys.has(key) : usedKeys.includes(key));
      const filtered = pool.filter(p => !isUsed([p.civilian, p.undercover].sort().join('###')));
      if (filtered.length > 0) {
        availablePool = filtered;
      } else {
        // 当前分类所有词全部用尽时，重置并清空已使用记录，重新循环
        if (usedKeys instanceof Set) {
          pool.forEach(p => usedKeys.delete([p.civilian, p.undercover].sort().join('###')));
        } else if (Array.isArray(usedKeys)) {
          pool.forEach(p => {
            const idx = usedKeys.indexOf([p.civilian, p.undercover].sort().join('###'));
            if (idx !== -1) usedKeys.splice(idx, 1);
          });
        }
        availablePool = pool;
      }
    }

    const selected = availablePool[Math.floor(Math.random() * availablePool.length)];
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
