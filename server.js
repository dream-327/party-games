const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const { setupUndercover, wordCategories } = require('./games/undercover/server');
const { setupDoudizhu } = require('./games/doudizhu/server');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());

// 静态资源路由分流
app.use('/undercover', express.static(path.join(__dirname, 'public/undercover')));
app.use('/doudizhu', express.static(path.join(__dirname, 'public/doudizhu')));
app.use('/', express.static(path.join(__dirname, 'public/hub')));

// 智能获取真实物理网卡 IP (优先 Wi-Fi / 手机热点 / 局域网)
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const primaryIps = [];
  const otherIps = [];

  for (const name of Object.keys(interfaces)) {
    const isVirtual = /vEthernet|WSL|VMware|VirtualBox|Loopback|Meta|Clash|tun|tap|Bluetooth|蓝牙/i.test(name);
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        if (ip.startsWith('198.18.') || ip.startsWith('169.254.')) {
          continue;
        }
        const isWifiOrHotspot = /wlan|wi-fi|wifi|无线|以太网|ethernet/i.test(name)
          || ip.startsWith('192.168.')
          || ip.startsWith('172.20.10.');

        if (!isVirtual && isWifiOrHotspot) {
          primaryIps.push({ name, address: ip, isPrimary: true });
        } else if (!isVirtual) {
          otherIps.push({ name, address: ip, isPrimary: false });
        }
      }
    }
  }

  const results = [...primaryIps, ...otherIps];
  return results.length > 0 ? results : [{ name: '本地', address: '127.0.0.1', isPrimary: true }];
}

// 基础网络信息查询接口
app.get('/api/server-info', (req, res) => {
  const ipObjs = getLocalIPs();
  const ips = ipObjs.map(item => item.address);
  res.json({
    ipObjs,
    ips,
    port: PORT,
    urls: ips.map(ip => `http://${ip}:${PORT}`),
    categories: wordCategories,
    games: [
      { id: 'undercover', name: '谁是卧底', path: '/undercover/' },
      { id: 'doudizhu', name: '欢乐斗地主', path: '/doudizhu/' }
    ]
  });
});

// 挂载两个游戏的 Socket.IO 服务
setupUndercover(io, app);
setupDoudizhu(io, app);

// 启动统一服务器
server.listen(PORT, '0.0.0.0', () => {
  const ipObjs = getLocalIPs();
  console.log('====================================================');
  console.log('🎉 聚会游戏盒子 (Party Games Hub) 服务器启动成功！');
  console.log(`🌐 电脑本机访问游戏大厅: http://localhost:${PORT}`);
  console.log(`🕵️‍♂️ 《谁是卧底》直达: http://localhost:${PORT}/undercover/`);
  console.log(`🃏 《欢乐斗地主》直达: http://localhost:${PORT}/doudizhu/`);
  console.log('📱 手机/局域网/热点访问推荐:');
  ipObjs.forEach(item => {
    console.log(`   👉 http://${item.address}:${PORT} (${item.name}${item.isPrimary ? ' - 推荐' : ''})`);
  });
  console.log('🌐 搭配 cloudflared 开启穿透即可实现异地公网畅玩！');
  console.log('====================================================');
});

