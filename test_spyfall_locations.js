const assert = require('assert');
const {
  CLUSTERS,
  LOCATIONS,
  UNIVERSAL_ROLES,
  getRandomLocation,
  generateCandidateLocations
} = require('./games/spyfall/locations');

console.log('🧪 开始测试地点簇与混淆候选池算法...');

// 1. 题库完整性测试
assert(Array.isArray(CLUSTERS) && CLUSTERS.length >= 6, '必须包含至少 6 个核心特征簇');
assert(Array.isArray(LOCATIONS) && LOCATIONS.length >= 24, '必须预置至少 24 个高品质地点');
assert(Array.isArray(UNIVERSAL_ROLES) && UNIVERSAL_ROLES.length >= 4, '必须包含普适角色库');

CLUSTERS.forEach(c => {
  assert(c.id && c.name && c.description, `特征簇 ${c.id} 缺少必填字段`);
});

const locationIds = new Set();
LOCATIONS.forEach(loc => {
  assert(loc.id && loc.name && loc.icon && loc.clusterId, `地点 ${loc.id} 缺少必填字段`);
  assert(!locationIds.has(loc.id), `地点 ID [${loc.id}] 重复`);
  locationIds.add(loc.id);
  assert(CLUSTERS.some(c => c.id === loc.clusterId), `地点 ${loc.name} 所属簇 ${loc.clusterId} 未在 CLUSTERS 中定义`);
  assert(Array.isArray(loc.roles) && loc.roles.length >= 5, `地点 ${loc.name} 角色数必须 >= 5`);
  assert(typeof loc.fallbackRole === 'string' && loc.fallbackRole.length > 0, `地点 ${loc.name} 必须配置兜底角色`);
});

// 2. 随机抽取与近邻混淆池算法测试
const randomLoc = getRandomLocation();
assert(randomLoc && randomLoc.id, '应当成功随机抽取一个真实地点');

const candidates = generateCandidateLocations(randomLoc.id);
assert(candidates.length >= 16 && candidates.length <= 18, `候选池数量必须在 16~18 之间，实际: ${candidates.length}`);

// 3. 强关联兄弟地点注入断言
const brothersInCluster = LOCATIONS.filter(l => l.clusterId === randomLoc.clusterId);
brothersInCluster.forEach(brother => {
  const found = candidates.some(c => c.id === brother.id);
  assert(found, `特征簇兄弟地点 [${brother.name}] 必须被强制注入候选池中以保障迷惑性`);
});

// 4. 排序一致性断言 (按拼音/字符升序排列)
for (let i = 0; i < candidates.length - 1; i++) {
  const comp = candidates[i].name.localeCompare(candidates[i + 1].name, 'zh-CN');
  assert(comp <= 0, `候选池地点必须保持字典序一致排列: ${candidates[i].name} vs ${candidates[i+1].name}`);
}

// 5. 对全部地点做遍历检验，确保任意地点均能成功生成有效候选池
LOCATIONS.forEach(loc => {
  const pool = generateCandidateLocations(loc.id);
  assert(pool.length >= 16 && pool.length <= 18, `地点 [${loc.name}] 生成的候选池长度不符合要求: ${pool.length}`);
  const brotherLocs = LOCATIONS.filter(l => l.clusterId === loc.clusterId);
  brotherLocs.forEach(b => {
    assert(pool.some(c => c.id === b.id), `地点 [${loc.name}] 候选池必须包含兄弟地点 [${b.name}]`);
  });
  for (let i = 0; i < pool.length - 1; i++) {
    assert(pool[i].name.localeCompare(pool[i + 1].name, 'zh-CN') <= 0, `字典序必须正确: ${pool[i].name} <= ${pool[i+1].name}`);
  }
});

console.log('✅ 地点簇与混淆候选池算法测试全部通过！');
