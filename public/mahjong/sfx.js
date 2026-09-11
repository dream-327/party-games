// 四川麻将专业拟真骨玉音效与川味/国风语音合成引擎 (Web Audio API & Speech Synthesis)
(function() {
  class MahjongSFX {
    constructor() {
      this.ctx = null;
      this.enabled = localStorage.getItem('mj_sound') !== 'false';
      this.cnVoice = null;
      this.speechUnlocked = false;
      this.initVoices();

      // 用户任意手势解锁音效与语音
      if (typeof window !== 'undefined') {
        const unlock = () => {
          this.init();
          this.unlockSpeech();
          window.removeEventListener('click', unlock);
          window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
      }
    }

    initVoices() {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const setVoice = () => {
        try {
          const voices = window.speechSynthesis.getVoices();
          this.cnVoice = voices.find(v => v.lang === 'zh-CN' || v.lang.startsWith('zh')) || null;
        } catch (e) {}
      };
      setVoice();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = setVoice;
      }
    }

    unlockSpeech() {
      if (this.speechUnlocked || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.resume();
        const utter = new SpeechSynthesisUtterance('');
        utter.volume = 0;
        window.speechSynthesis.speak(utter);
        this.speechUnlocked = true;
      } catch (e) {}
    }

    init() {
      if (!this.ctx && typeof AudioContext !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggleSound() {
      this.enabled = !this.enabled;
      localStorage.setItem('mj_sound', this.enabled);
      return this.enabled;
    }

    // 1. 麻将玉石清脆敲击声 (选牌/点选)
    playTileClick() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400 + Math.random() * 200, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.05);

      gain.gain.setValueAtTime(0.32, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.07);
    }

    // 2. 摸牌抽牌滑行声 (轻快滑入手中)
    playDraw() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // 快速摩擦轻微杂音 + 脆响
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.06);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.11);
    }

    // 3. 推牌出牌落桌声 (沉稳有力的骨牌重重拍桌 "啪！")
    playTileDiscard() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;

      // 低频桌板共振冲击
      const lowOsc = this.ctx.createOscillator();
      const lowGain = this.ctx.createGain();
      lowOsc.type = 'triangle';
      lowOsc.frequency.setValueAtTime(220, t);
      lowOsc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
      lowGain.gain.setValueAtTime(0.55, t);
      lowGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      lowOsc.connect(lowGain);
      lowGain.connect(this.ctx.destination);

      lowOsc.start(t);
      lowOsc.stop(t + 0.15);

      // 高频瓷玉脆拍
      const highOsc = this.ctx.createOscillator();
      const highGain = this.ctx.createGain();
      highOsc.type = 'sine';
      highOsc.frequency.setValueAtTime(1850, t);
      highOsc.frequency.exponentialRampToValueAtTime(500, t + 0.07);
      highGain.gain.setValueAtTime(0.4, t);
      highGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      highOsc.connect(highGain);
      highGain.connect(this.ctx.destination);

      highOsc.start(t);
      highOsc.stop(t + 0.09);
    }

    // 4. 洗牌与砌牌哗啦滑行声 (开局发牌对局启动)
    playDeal() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // 模拟多张牌快速连击与摩擦滑过桌布
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = i % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(900 + Math.random() * 600, this.ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.06);
          gain.gain.setValueAtTime(0.22, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.07);
        }, i * 65);
      }
    }

    // 5. 换三张牌互换滑动音效
    playSwap() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(950, t + 0.15);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.28);

      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.3);
    }

    // 6. 定缺敲定清鸣音效 (青铜编钟泛音)
    playDingQue() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const freqs = [659.25, 1318.5]; // E调空灵双音
      freqs.forEach(f => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.36);
      });
    }

    // 7. 碰牌！清脆双连击
    playPeng(seatIndex = null) {
      if (!this.enabled) return;
      this.playTileClick();
      setTimeout(() => this.playTileClick(), 75);
      this.speak('碰！', seatIndex);
    }

    // 8. 杠牌（刮风 / 下雨）呼啸与雷鸣
    playGang(isXiayu = false, seatIndex = null) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // 白噪音模拟龙卷呼啸 / 暴雨骤降
      const bufferSize = this.ctx.sampleRate * 0.45;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = isXiayu ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(isXiayu ? 260 : 750, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.42);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(t);
      noise.stop(t + 0.45);

      this.speak(isXiayu ? '下雨咯！' : '刮风！', seatIndex);
    }

    // 9. 胡牌大满贯盛典和弦
    playHu(isZimo = false, seatIndex = null) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.5]; // C大调富贵和弦
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, this.ctx.currentTime + idx * 0.07);

        gain.gain.setValueAtTime(0.38, this.ctx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.07 + 0.85);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + idx * 0.07);
        osc.stop(this.ctx.currentTime + idx * 0.07 + 0.9);
      });

      this.speak(isZimo ? '自摸，胡啦！' : '胡啦！', seatIndex);
    }

    // 10. 倒计时警示滴答声 (最后5秒)
    playTick() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.05);
    }

    // 11. 金币落袋哗啦声 (得分/赢牌)
    playCoins() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1600 + i * 200, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.1);
        }, i * 60);
      }
    }

    // 12. 智能牌名朗读播报 (如 "一万"、"五筒"、"八条")
    speakTile(tile, seatIndex = null) {
      if (!tile) return;
      const NUM_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
      const SUIT_NAMES = { wan: '万', tong: '筒', tiao: '条' };

      const numStr = NUM_NAMES[tile.rank] || tile.rank;
      const suitStr = SUIT_NAMES[tile.suit] || '';
      if (numStr && suitStr) {
        this.speak(`${numStr}${suitStr}`, seatIndex);
      }
    }

    // 语音朗读辅助 (Web Speech API 智能普通话 + 桌面视觉气泡)
    speak(text, seatIndex = null) {
      // 1. 触发 UI 视觉语音气泡 (即使设备静音也绝不漏听出牌)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mj_voice_bubble', {
          detail: { text, seatIndex }
        }));
      }

      // 2. 语音合成播报
      if (!this.enabled) return;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.resume();
          // 如果当前正在播报，取消前一个
          if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
          }

          setTimeout(() => {
            try {
              const utter = new SpeechSynthesisUtterance(text);
              if (!this.cnVoice) {
                const voices = window.speechSynthesis.getVoices();
                this.cnVoice = voices.find(v => v.lang === 'zh-CN' || v.lang.startsWith('zh')) || null;
              }
              if (this.cnVoice) utter.voice = this.cnVoice;
              utter.lang = 'zh-CN';
              utter.rate = 1.25;
              utter.pitch = 1.08;
              utter.volume = 1.0;
              window.speechSynthesis.speak(utter);
            } catch (err) {}
          }, 15);
        } catch (e) {}
      }
    }
  }

  window.sfx = new MahjongSFX();
})();
