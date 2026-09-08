// Dou Dizhu Sound & Voice Engine (欢乐斗地主 拟真原生音频与国语普通话语音大脑)
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

  // Web Speech API 真实国语配音
  function speakChinese(text, pitch = 1.0, rate = 1.08) {
    if (!isSoundEnabled) return;
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // 停止上一段，避免堆叠延误
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.pitch = pitch;
      u.rate = rate;
      u.volume = 0.95;

      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('cmn') || v.name.includes('Chinese') || v.name.includes('Xiaoxiao') || v.name.includes('Yunxi') || v.name.includes('Huihui'));
      if (zhVoice) {
        u.voice = zhVoice;
      }
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn('SpeechSynthesis error:', e);
    }
  }

  const sfx = {
    toggleSound: function() {
      isSoundEnabled = !isSoundEnabled;
      if (!isSoundEnabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return isSoundEnabled;
    },
    isSoundEnabled: function() {
      return isSoundEnabled;
    },

    // 语音朗读
    speak: function(text, pitch = 1.0) {
      speakChinese(text, pitch);
    },

    // 洗牌与发牌声
    playDeal: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } catch (e) {}
    },

    // 选中/取消手牌轻快音效
    playCardSelect: function() {
      playTone(680, 'sine', 0.05, 0.08);
    },

    // 出牌落地声 (清脆扑克碰撞声)
    playCardPlay: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.28, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } catch (e) {}
    },

    // 不出 / 过牌 (音效 + 经典语音随机)
    playPass: function() {
      playTone(320, 'sine', 0.1, 0.15);
      setTimeout(() => playTone(240, 'sine', 0.12, 0.12), 80);
      const lines = ['不要', '过', '要不起', '不出'];
      const pick = lines[Math.floor(Math.random() * lines.length)];
      setTimeout(() => speakChinese(pick, 1.0, 1.15), 100);
    },

    // 叫地主
    playCallBid: function() {
      playTone(523.25, 'triangle', 0.1, 0.18);
      setTimeout(() => playTone(659.25, 'triangle', 0.15, 0.2), 120);
      setTimeout(() => speakChinese('叫地主！', 1.05, 1.1), 100);
    },

    // 不叫
    playPassBid: function() {
      playTone(392, 'sine', 0.12, 0.15);
      setTimeout(() => playTone(330, 'sine', 0.14, 0.12), 100);
      setTimeout(() => speakChinese('不叫！', 0.95, 1.1), 100);
    },

    // 抢地主
    playRobBid: function() {
      playTone(587.33, 'triangle', 0.1, 0.2);
      setTimeout(() => playTone(783.99, 'triangle', 0.18, 0.25), 100);
      setTimeout(() => speakChinese('抢地主！', 1.1, 1.15), 100);
    },

    // 不抢
    playPassRob: function() {
      playTone(392, 'sine', 0.12, 0.15);
      setTimeout(() => playTone(330, 'sine', 0.14, 0.12), 100);
      setTimeout(() => speakChinese('不抢！', 0.95, 1.1), 100);
    },

    // 牌型专属播报
    playCardCombo: function(cardType, length = 0) {
      this.playCardPlay();
      switch (cardType) {
        case 'STRAIGHT':
          playTone(523.25, 'triangle', 0.08, 0.15);
          setTimeout(() => playTone(659.25, 'triangle', 0.08, 0.18), 80);
          setTimeout(() => playTone(783.99, 'triangle', 0.12, 0.2), 160);
          speakChinese('顺子！', 1.05, 1.15);
          break;
        case 'STRAIGHT_PAIRS':
          playTone(523.25, 'triangle', 0.08, 0.15);
          setTimeout(() => playTone(659.25, 'triangle', 0.08, 0.18), 80);
          setTimeout(() => playTone(880, 'triangle', 0.15, 0.22), 160);
          speakChinese('连对！', 1.05, 1.15);
          break;
        case 'AIRPLANE':
        case 'AIRPLANE_SINGLES':
        case 'AIRPLANE_PAIRS':
          this.playAirplane();
          speakChinese('飞机！', 1.1, 1.15);
          break;
        case 'TRIPLE_ONE':
          speakChinese('三带一！', 1.0, 1.15);
          break;
        case 'TRIPLE_PAIR':
          speakChinese('三带对！', 1.0, 1.15);
          break;
        case 'FOUR_TWO_SINGLES':
        case 'FOUR_TWO_PAIRS':
          speakChinese('四带二！', 1.05, 1.15);
          break;
        case 'BOMB':
          this.playBomb();
          speakChinese('炸弹！', 1.15, 1.15);
          break;
        case 'ROCKET':
          this.playRocket();
          speakChinese('王炸！', 1.2, 1.15);
          break;
        default:
          // 单牌或对子有时配大你
          break;
      }
    },

    // 飞机音效 (呼啸破空)
    playAirplane: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.3);
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.6);

        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } catch (e) {}
    },

    // 报单警报 (只剩 1 张)
    playAlertSingle: function() {
      playTone(987.77, 'square', 0.1, 0.2);
      setTimeout(() => playTone(987.77, 'square', 0.12, 0.22), 120);
      setTimeout(() => speakChinese('我就剩一张牌了！', 1.1, 1.15), 150);
    },

    // 报双警报 (只剩 2 张)
    playAlertDouble: function() {
      playTone(880, 'square', 0.1, 0.18);
      setTimeout(() => playTone(880, 'square', 0.12, 0.2), 120);
      setTimeout(() => speakChinese('小心，我就剩两张牌了！', 1.05, 1.12), 150);
    },

    // 倒计时嘀嗒预警
    playTick: function() {
      playTone(880, 'sine', 0.05, 0.1);
    },

    // 倒计时告急 (<5秒心跳加速)
    playUrgentTick: function() {
      playTone(1100, 'square', 0.06, 0.16);
      setTimeout(() => playTone(880, 'square', 0.05, 0.14), 70);
    },

    // 炸弹爆炸震撼音效
    playBomb: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.7);

        gain.gain.setValueAtTime(0.45, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.7);
      } catch (e) {}
    },

    // 火箭升空爆炸 (王炸)
    playRocket: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1700, ctx.currentTime + 0.4);

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);

        setTimeout(() => this.playBomb(), 400);
      } catch (e) {}
    },

    // 春天 / 反春欢呼音效
    playSpring: function() {
      if (!isSoundEnabled) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.25, 0.25), idx * 100);
      });
      setTimeout(() => speakChinese('春天！太帅啦！', 1.15, 1.1), 300);
    },

    // 胜利号角
    playWin: function() {
      if (!isSoundEnabled) return;
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.3, 0.25), idx * 140);
      });
      setTimeout(() => speakChinese('恭喜发财，大吉大利！赢啦！', 1.1, 1.1), 400);
    },

    // 惜败落寞音
    playLose: function() {
      if (!isSoundEnabled) return;
      const notes = [523.25, 493.88, 440, 392];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'sine', 0.35, 0.2), idx * 180);
      });
      setTimeout(() => speakChinese('别灰心，下把一定赢！', 0.95, 1.1), 500);
    }
  };

  window.sfx = sfx;
})();
