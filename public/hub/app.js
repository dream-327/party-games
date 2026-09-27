// Party Games Hub 前端交互
(function() {
  const btnShareHub = document.getElementById('btn-share-hub');
  const modalShareHub = document.getElementById('modal-share-hub');
  const btnCloseShareHub = document.getElementById('btn-close-share-hub');
  const shareHubInput = document.getElementById('share-hub-input');
  const btnCopyHubLink = document.getElementById('btn-copy-hub-link');
  const hubNetworkList = document.getElementById('hub-network-list');
  const quickDomainPill = document.getElementById('quick-domain-pill');

  let serverInfo = null;

  fetch('/api/server-info')
    .then(res => res.json())
    .then(info => {
      serverInfo = info;
      if (window.location.protocol === 'https:' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        quickDomainPill.textContent = `在线: ${window.location.host}`;
      } else {
        quickDomainPill.textContent = `本地运行`;
      }
    })
    .catch(() => {});

  btnShareHub.addEventListener('click', () => {
    playHubChime();
    openHubShareModal();
  });

  btnCloseShareHub.addEventListener('click', () => {
    playHubChime();
    modalShareHub.classList.add('hidden');
  });

  btnCopyHubLink.addEventListener('click', () => {
    playHubChime();
    shareHubInput.select();
    navigator.clipboard.writeText(shareHubInput.value).then(() => {
      btnCopyHubLink.textContent = '已复制！';
      setTimeout(() => { btnCopyHubLink.textContent = '复制链接'; }, 1500);
    });
  });

  // Web Audio 轻量交互音效与触觉反馈 (Audio Design & Game Feel)
  let audioCtx = null;
  function playHubChime() {
    try {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) audioCtx = new AudioCtx();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      if (audioCtx) {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (e) {}
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15); } catch (e) {}
    }
  }

  // 为所有按钮和游戏入口绑定微交互
  document.querySelectorAll('a.btn, button.tool-btn, button.btn').forEach(el => {
    el.addEventListener('click', () => playHubChime());
  });

  function openHubShareModal() {
    modalShareHub.classList.remove('hidden');
    hubNetworkList.innerHTML = '';

    const isPublicOrigin = window.location.protocol === 'https:' ||
      (!['localhost', '127.0.0.1'].includes(window.location.hostname) &&
       !window.location.hostname.startsWith('192.168.') &&
       !window.location.hostname.startsWith('10.') &&
       !window.location.hostname.startsWith('172.'));

    let primaryUrl = window.location.origin;

    if (isPublicOrigin) {
      const pubUrl = window.location.origin;
      const card = document.createElement('div');
      card.style.cssText = `padding: 12px; background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.35); border-radius: 8px; text-align: center; margin-bottom: 8px;`;
      card.innerHTML = `
        <div style="font-size: 13px; color: #e2e8f0; font-weight: 600;">
          📱 微信或手机浏览器扫码，直接进入游戏大厅
        </div>
        <div style="font-size: 11px; color: #a855f7; margin-top: 4px;">全网联机 · 免下载即开即玩</div>
      `;
      hubNetworkList.appendChild(card);
      drawQR(pubUrl);
      return;
    }

    if (serverInfo && serverInfo.ipObjs) {
      serverInfo.ipObjs.forEach(item => {
        const itemUrl = `http://${item.address}:${serverInfo.port}`;
        const card = document.createElement('div');
        card.style.cssText = `padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; cursor: pointer; display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;`;
        card.innerHTML = `
          <div>
            <div style="font-weight:700; color:#fff; font-size:13px;">${itemUrl}</div>
            <div style="font-size:11px; color:#94a3b8;">${item.name}</div>
          </div>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;">生成此码</button>
        `;
        card.addEventListener('click', () => drawQR(itemUrl));
        hubNetworkList.appendChild(card);
      });
    }

    drawQR(primaryUrl);
  }

  function drawQR(url) {
    shareHubInput.value = url;
    const container = document.getElementById('qrcode-hub-container');
    container.innerHTML = '';
    if (window.QRCode) {
      new window.QRCode(container, {
        text: url,
        width: 180,
        height: 180,
        colorDark: '#000000',
        colorLight: '#ffffff'
      });
    }
  }
})();
