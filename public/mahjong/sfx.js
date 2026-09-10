// 四川麻将专业音效与国风/川味语音合成引擎
(function() {
  class MahjongSFX {
    constructor() {
      this.ctx = null;
      this.enabled = localStorage.getItem('mj_sound') !== 'false';
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

    // 1. 麻将玉石清脆敲击声 (摸牌/点选)
    playTileClick() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200 + Math.random() * 200, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    }

    // 2. 推牌出牌落桌声 (沉稳骨玉碰撞)
    playTileDiscard() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.45, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    }

    // 3. 掷骰子咕噜转动声
    playDice() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          this.playTileClick();
        }, i * 65);
      }
    }

    // 4. 碰牌清脆双响
    playPeng() {
      if (!this.enabled) return;
      this.playTileClick();
      setTimeout(() => this.playTileClick(), 80);
      this.speak('碰！');
    }

    // 5. 杠牌（刮风 / 下雨）呼啸与雷鸣
    playGang(isXiayu = false) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      // 白噪音模拟龙卷呼啸
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = isXiayu ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(isXiayu ? 200 : 800, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.38);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();
      noise.stop(this.ctx.currentTime + 0.4);

      this.speak(isXiayu ? '下雨咯！' : '刮风！');
    }

    // 6. 胡牌大铜锣与胜利和弦
    playHu(isZimo = false) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C大调神圣和弦
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, this.ctx.currentTime + idx * 0.08);

        gain.gain.setValueAtTime(0.35, this.ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.08 + 0.7);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + idx * 0.08);
        osc.stop(this.ctx.currentTime + idx * 0.08 + 0.75);
      });

      this.speak(isZimo ? '自摸，胡啦！' : '胡啦！');
    }

    // 语音朗读辅助 (Web Speech API)
    speak(text) {
      if (!this.enabled) return;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'zh-CN';
          utter.rate = 1.25;
          utter.pitch = 1.1;
          window.speechSynthesis.speak(utter);
        } catch (e) {}
      }
    }
  }

  window.sfx = new MahjongSFX();
})();
