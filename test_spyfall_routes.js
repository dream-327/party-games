// test_spyfall_routes.js
const assert = require('assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const { setupSpyfall } = require('./games/spyfall/server');

console.log('🧪 开始测试服务器路由与大厅集成...');

// 1. 验证 server.js 文件源码中已正确注册 spyfall
const serverJsContent = require('fs').readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(serverJsContent.includes("setupSpyfall"), 'server.js 必须引入 setupSpyfall');
assert(serverJsContent.includes("app.use('/spyfall'"), 'server.js 必须挂载 /spyfall 静态路由');
assert(serverJsContent.includes("id: 'spyfall'"), 'server.js games 列表必须包含 spyfall');
assert(serverJsContent.includes("/spyfall/"), 'server.js 必须包含 /spyfall/ 路径或启动打印');

// 2. 验证 public/hub/index.html 中已添加间谍危机入口卡片
const hubHtml = require('fs').readFileSync(path.join(__dirname, 'public/hub/index.html'), 'utf8');
assert(hubHtml.includes('/spyfall/'), 'public/hub/index.html 必须包含指向 /spyfall/ 的链接');
assert(hubHtml.includes('间谍危机'), 'public/hub/index.html 必须包含间谍危机卡片');

// 3. 动态实例化验证挂载正常
const app = express();
const server = http.createServer(app);
const io = new Server(server);
setupSpyfall(io, app);
assert(io._nsps.has('/spyfall'), 'Socket.IO 必须成功创建 /spyfall 命名空间');

console.log('✅ 路由与大厅集成验证全部通过！');
