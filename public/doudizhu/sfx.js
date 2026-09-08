// Dou Dizhu Sound Effects Engine (纯 Web Audio 原生合成音效)
(function() {
  let audioCtx = null;
  let isSoundEnabled = true;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.2) {
    if (!isSoundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio playTone error', e);
    }
  }

  const sfx = {
    toggleSound: function() {
      isSoundEnabled = !isSoundEnabled;
      return isSoundEnabled;
    },
    isSoundEnabled: function() {
      return isSoundEnabled;
    },

    // 发牌刷牌声
    playDeal: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch (e) {}
    },

    // 选中/取消卡牌微声
    playCardSelect: function() {
      playTone(600, 'sine', 0.05, 0.1);
    },

    // 出牌落地声 (清脆扑克声)
    playCardPlay: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        // 白噪声配合轻微低频撞击
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);

        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } catch (e) {}
    },

    // 不出 / 过牌提示
    playPass: function() {
      playTone(320, 'sine', 0.12, 0.15);
      setTimeout(() => playTone(240, 'sine', 0.15, 0.12), 100);
    },

    // 叫地主 / 抢地主提示
    playBid: function() {
      playTone(523.25, 'triangle', 0.1, 0.18); // C5
      setTimeout(() => playTone(659.25, 'triangle', 0.15, 0.2), 120); // E5
    },

    // 倒计时嘀嗒预警
    playTick: function() {
      playTone(880, 'sine', 0.06, 0.12);
    },

    // 倒计时告急
    playUrgentTick: function() {
      playTone(1200, 'square', 0.08, 0.18);
    },

    // 炸弹爆炸震撼音效
    playBomb: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        // 低频下潜 + 噪声震颤
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.6);

        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } catch (e) {}
    },

    // 火箭升空爆炸 (王炸)
    playRocket: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        // 呼啸升空音调
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.4);

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);

        // 随后接炸弹轰鸣
        setTimeout(() => this.playBomb(), 380);
      } catch (e) {}
    },

    // 春天 / 反春欢呼音效
    playSpring: function() {
      if (!isSoundEnabled) return;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.25, 0.25), idx * 100);
      });
    },

    // 胜利号角
    playWin: function() {
      if (!isSoundEnabled) return;
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.3, 0.25), idx * 140);
      });
    },

    // 惜败落寞音
    playLose: function() {
      if (!isSoundEnabled) return;
      const notes = [523.25, 493.88, 440, 392];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'sine', 0.35, 0.2), idx * 180);
      });
    }
  };

  window.sfx = sfx;
})();
