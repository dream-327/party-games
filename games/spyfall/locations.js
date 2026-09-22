/**
 * 间谍危机 (Spyfall) - 地点簇配置、角色库与近邻混淆候选池生成算法
 */

// 六大核心特征重叠簇定义
const CLUSTERS = [
  {
    id: 'water',
    name: '水域与航行',
    description: '水体、摇晃颠簸、救生设备、封闭舱室、制服船员'
  },
  {
    id: 'medical',
    name: '医疗与救治',
    description: '白大褂、消毒水味、针剂针管、病床、安静与消毒要求'
  },
  {
    id: 'aviation_transport',
    name: '高空与封闭交通',
    description: '座位排号、安全带、广播播音、禁止吸烟、狭窄洗手间、安检'
  },
  {
    id: 'research_secret',
    name: '保密与尖端科研',
    description: '门禁指纹、通行证保密协议、精密仪器、白大褂、无尘要求'
  },
  {
    id: 'nightlife',
    name: '夜色与声色娱乐',
    description: '昏暗灯光、酒水饮料、门票/手环、喧闹音乐、高消费'
  },
  {
    id: 'order_ceremony',
    name: '庄严肃穆与公共秩序',
    description: '仪式感、正装制服、禁止喧哗走动、排队排号、严格流程'
  }
];

// 特征簇弱关联近邻映射（用于注入跨簇近邻混淆地点）
const RELATED_CLUSTERS = {
  water: ['aviation_transport', 'research_secret'],
  medical: ['research_secret', 'order_ceremony'],
  aviation_transport: ['water', 'nightlife'],
  research_secret: ['medical', 'aviation_transport'],
  nightlife: ['order_ceremony', 'aviation_transport'],
  order_ceremony: ['medical', 'nightlife']
};

// 普适通用角色（用于混淆博弈，平民抽取到时回答天然具备普适性）
const UNIVERSAL_ROLES = ['安保人员', '保洁员', '维修工', '访客/顾客'];

// 预置 26 个高品质主题地点及典型角色
const LOCATIONS = [
  // 1. 水域与航行 (5)
  {
    id: 'submarine',
    name: '核潜艇',
    icon: '⚓',
    clusterId: 'water',
    roles: ['艇长', '声呐兵', '鱼雷士官', '随艇政委', '水兵学员', '轮机长'],
    fallbackRole: '水兵学员'
  },
  {
    id: 'pirate_ship',
    name: '加勒比海盗船',
    icon: '🏴‍☠️',
    clusterId: 'water',
    roles: ['独眼船长', '大副', '瞭望水手', '火炮手', '划桨奴工', '藏宝图保管员'],
    fallbackRole: '普通海盗'
  },
  {
    id: 'cruise',
    name: '豪华远洋游轮',
    icon: '🚢',
    clusterId: 'water',
    roles: ['游轮船长', '大堂经理', '赌场荷官', '客房管家', '度假富豪', '甲板救生员'],
    fallbackRole: '度假游客'
  },
  {
    id: 'deepsea_station',
    name: '深海科考站',
    icon: '🌊',
    clusterId: 'water',
    roles: ['站长', '潜水员', '海洋生物学家', '深潜器操作员', '实习生', '水下摄影师'],
    fallbackRole: '科考实习生'
  },
  {
    id: 'car_ferry',
    name: '跨海汽车渡轮',
    icon: '⛴️',
    clusterId: 'water',
    roles: ['渡轮舵手', '汽车调度员', '售票检票员', '长途货车司机', '游客', '甲板水手'],
    fallbackRole: '渡轮乘客'
  },

  // 2. 医疗与救治 (5)
  {
    id: 'hospital',
    name: '三甲综合医院',
    icon: '🏥',
    clusterId: 'medical',
    roles: ['主刀医生', '急救护士', '麻醉师', '住院患者', '探视家属', '药房药剂师'],
    fallbackRole: '门诊患者'
  },
  {
    id: 'psychiatric_center',
    name: '精神康复中心',
    icon: '🧠',
    clusterId: 'medical',
    roles: ['精神科医师', '心理咨询师', '康复护工', '特护病患', '宿管保安', '艺术治疗师'],
    fallbackRole: '疗养病患'
  },
  {
    id: 'field_hospital',
    name: '野战战地医院',
    icon: '⛺',
    clusterId: 'medical',
    roles: ['军医长官', '战地护士', '伤病伤员', '担架搬运兵', '随军神父', '野战药品补给员'],
    fallbackRole: '轻伤士兵'
  },
  {
    id: 'quarantine_shelter',
    name: '防疫隔离方舱',
    icon: '🛡️',
    clusterId: 'medical',
    roles: ['消杀专员', '核酸采样员', '流行病学调查员', '隔离人员', '志愿者', '物资分发员'],
    fallbackRole: '隔离观察员'
  },
  {
    id: 'aesthetic_clinic',
    name: '高端医美诊所',
    icon: '💉',
    clusterId: 'medical',
    roles: ['整形专家', '咨询顾问', '麻醉护士', 'VIP顾客', '前台接待', '光子嫩肤操作师'],
    fallbackRole: '咨询顾客'
  },

  // 3. 高空与封闭交通 (4)
  {
    id: 'airplane',
    name: '民航客机',
    icon: '✈️',
    clusterId: 'aviation_transport',
    roles: ['机长', '副驾驶', '乘务长', '经济舱空乘', '商务舱乘客', '空中安全员'],
    fallbackRole: '经济舱乘客'
  },
  {
    id: 'space_station',
    name: '国际空间站',
    icon: '🛰️',
    clusterId: 'aviation_transport',
    roles: ['指令长', '航天员', '太空机械师', '天体物理学者', '太空游客', '舱外活动专家'],
    fallbackRole: '航天观察员'
  },
  {
    id: 'high_speed_train',
    name: '高铁商务车厢',
    icon: '🚄',
    clusterId: 'aviation_transport',
    roles: ['高铁司机', '列车长', '乘务员', '商务座乘客', '保洁员', '餐车售货员'],
    fallbackRole: '商务座乘客'
  },
  {
    id: 'night_bus',
    name: '跨国过夜大巴',
    icon: '🚌',
    clusterId: 'aviation_transport',
    roles: ['长途司机', '轮换押运员', '背包客', '打工返乡人', '打鼾乘客', '代购商贩'],
    fallbackRole: '靠窗乘客'
  },

  // 4. 保密与尖端科研 (4)
  {
    id: 'military_base',
    name: '绝密军事基地',
    icon: '🪖',
    clusterId: 'research_secret',
    roles: ['基地司令', '雷达哨兵', '密码破译员', '重装特警', '勤务兵', '战略战术参谋'],
    fallbackRole: '巡逻士兵'
  },
  {
    id: 'antarctic_station',
    name: '南极科学考察站',
    icon: '🧊',
    clusterId: 'research_secret',
    roles: ['科考站长', '气象学家', '冰川地质学者', '柴油发电技工', '越冬厨师', '极地通讯员'],
    fallbackRole: '后勤保障员'
  },
  {
    id: 'virus_lab',
    name: '高等级病毒研究所',
    icon: '🔬',
    clusterId: 'research_secret',
    roles: ['首席科学家', 'P4实验员', '生物安全官', '灭菌技术员', '实验助理', '高危标本保管员'],
    fallbackRole: '实验助理'
  },
  {
    id: 'particle_collider',
    name: '大型粒子对撞机中心',
    icon: '⚛️',
    clusterId: 'research_secret',
    roles: ['理论物理学家', '超导磁体工程师', '数据监测员', '安全巡检员', '访问学者', '控制台技术员'],
    fallbackRole: '访问学者'
  },

  // 5. 夜色与声色娱乐 (4)
  {
    id: 'nightclub',
    name: '地下酒吧夜总会',
    icon: '🍸',
    clusterId: 'nightlife',
    roles: ['调酒师', '驻唱歌手', '夜场DJ', 'VIP包厢客人', '看场保镖', '派对策划人'],
    fallbackRole: '吧台散客'
  },
  {
    id: 'casino',
    name: '豪华大赌场',
    icon: '🎲',
    clusterId: 'nightlife',
    roles: ['筹码兑换员', '二十一点荷官', '巡场监察', '豪赌狂客', '便衣安保', 'VIP洗码仔'],
    fallbackRole: '观光赌客'
  },
  {
    id: 'escape_room',
    name: '沉浸式密室馆',
    icon: '🔐',
    clusterId: 'nightlife',
    roles: ['密室店长', '机关控制员', 'NPC演员', '解谜硬核玩家', '尖叫新手', '场控监控员'],
    fallbackRole: '解谜玩家'
  },
  {
    id: 'livehouse',
    name: 'Livehouse音乐现场',
    icon: '🎸',
    clusterId: 'nightlife',
    roles: ['乐队主唱', '贝斯手', '调音师', '狂热乐迷', '前排保安', '周边贩卖员'],
    fallbackRole: '现场乐迷'
  },

  // 6. 庄严肃穆与公共秩序 (4)
  {
    id: 'court',
    name: '法院审判庭',
    icon: '⚖️',
    clusterId: 'order_ceremony',
    roles: ['主审法官', '公诉人', '辩护律师', '书记员', '被告人', '法警'],
    fallbackRole: '旁听群众'
  },
  {
    id: 'grand_theatre',
    name: '国家大剧院',
    icon: '🎭',
    clusterId: 'order_ceremony',
    roles: ['乐团首席指挥', '第一小提琴手', '歌剧演员', '剧场引座员', '观众', '舞台灯光师'],
    fallbackRole: '歌剧观众'
  },
  {
    id: 'museum',
    name: '大型美术博物馆',
    icon: '🏛️',
    clusterId: 'order_ceremony',
    roles: ['馆长', '艺术策展人', '文物修复师', '巡馆保安', '艺术系学生', '专业讲解员'],
    fallbackRole: '普通参观者'
  },
  {
    id: 'cathedral_wedding',
    name: '大教堂婚礼现场',
    icon: '⛪',
    clusterId: 'order_ceremony',
    roles: ['主礼牧师', '新郎', '新娘', '伴郎伴娘', '婚礼摄影师', '风琴伴奏师'],
    fallbackRole: '观礼宾客'
  }
];

/**
 * 随机数组打乱辅助函数 (Fisher-Yates)
 */
function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

/**
 * 随机抽取一个真实游戏地点
 * @returns {object} 地点对象
 */
function getRandomLocation() {
  const index = Math.floor(Math.random() * LOCATIONS.length);
  return LOCATIONS[index];
}

/**
 * 生成包含 16~18 个地点的近邻混淆候选池
 * 包含：真实地点 + 同特征簇所有兄弟地点 + 2~3 个弱关联近邻地点 + 随机补齐地点
 * 输出按中文拼音字典序严格排序，确保所有玩家端具备一致的排查网格
 * 
 * @param {string} targetLocationId 目标地点 ID
 * @param {number} [poolSize=16] 候选池大小（推荐 16~18，默认 16）
 * @returns {Array<object>} 规范化排序后的候选地点列表
 */
function generateCandidateLocations(targetLocationId, poolSize = 16) {
  let target = LOCATIONS.find(l => l.id === targetLocationId);
  if (!target) {
    target = getRandomLocation();
  }

  const selectedMap = new Map();

  // 1. 注入真实目标地点
  selectedMap.set(target.id, { ...target });

  // 2. 强行注入同簇所有兄弟地点（保障特征重叠与强混淆性）
  const brothers = LOCATIONS.filter(l => l.clusterId === target.clusterId);
  for (const b of brothers) {
    selectedMap.set(b.id, { ...b });
  }

  // 3. 从关联近邻簇抽取 2~3 个弱关联地点
  const relatedClusterIds = RELATED_CLUSTERS[target.clusterId] || [];
  const relatedLocs = LOCATIONS.filter(l => relatedClusterIds.includes(l.clusterId) && !selectedMap.has(l.id));
  const shuffledRelated = shuffle(relatedLocs);
  const relatedCount = Math.min(3, Math.max(2, Math.floor(Math.random() * 2) + 2)); // 2 或 3 个
  for (let i = 0; i < Math.min(relatedCount, shuffledRelated.length); i++) {
    selectedMap.set(shuffledRelated[i].id, { ...shuffledRelated[i] });
  }

  // 4. 从其余簇随机抽取地点补充至 poolSize (16~18)
  const targetCount = Math.max(16, Math.min(18, poolSize));
  const remainingLocs = LOCATIONS.filter(l => !selectedMap.has(l.id));
  const shuffledRemaining = shuffle(remainingLocs);

  for (const loc of shuffledRemaining) {
    if (selectedMap.size >= targetCount) break;
    selectedMap.set(loc.id, { ...loc });
  }

  // 5. 按照中文拼音/Unicode 进行统一字典序升序排列 (Canonical Order)
  const candidateList = Array.from(selectedMap.values());
  candidateList.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  return candidateList;
}

module.exports = {
  CLUSTERS,
  RELATED_CLUSTERS,
  UNIVERSAL_ROLES,
  LOCATIONS,
  getRandomLocation,
  generateCandidateLocations
};
