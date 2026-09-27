// 害你在心口难开 - 原生 Web Audio API 零延迟免下载音效引擎
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = localStorage.getItem('trapwords_sfx_enabled') !== 'false';

    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      };
      window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
      window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
    }
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        // Master Gain Bus & Limiter to prevent clipping
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  getMasterOut() {
    return this.masterGain || (this.ctx ? this.ctx.destination : null);
  }

  _jitter(freq, ratio = 0.035) {
    return freq * (1 + (Math.random() * 2 - 1) * ratio);
  }

  // 触觉物理震动 (Haptic Feedback)
  vibrate(type = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return false;
    try {
      const patterns = {
        light: 15,
        click: 20,
        caught: [100, 60, 100, 60, 200],
        dice: [25, 25, 25, 25],
        deal: 35,
        fanfare: [60, 40, 60, 40, 100]
      };
      return navigator.vibrate(patterns[type] || type);
    } catch (e) {
      return false;
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('trapwords_sfx_enabled', this.enabled ? 'true' : 'false');
    return this.enabled;
  }

  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const baseFreq = this._jitter(800);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.getMasterOut());
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
      this.vibrate('light');
    } catch (e) {}
  }

  // 抓包中招高能警笛音效
  playCaught() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      this.vibrate('caught');
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('screen-shake');
        void document.body.offsetWidth;
        document.body.classList.add('screen-shake');
        setTimeout(() => document.body.classList.remove('screen-shake'), 500);
      }

      const now = this.ctx.currentTime;
      // 警笛声 1
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(520, now);
      osc1.frequency.linearRampToValueAtTime(880, now + 0.15);
      osc1.frequency.linearRampToValueAtTime(520, now + 0.3);
      osc1.frequency.linearRampToValueAtTime(880, now + 0.45);

      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.linearRampToValueAtTime(0.25, now + 0.45);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.55);

      osc1.connect(gain1);
      gain1.connect(this.getMasterOut());
      osc1.start(now);
      osc1.stop(now + 0.55);

      // 低音砰击
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(150, now);
      subOsc.frequency.exponentialRampToValueAtTime(40, now + 0.3);

      subGain.gain.setValueAtTime(0.4, now);
      subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      subOsc.connect(subGain);
      subGain.connect(this.getMasterOut());
      subOsc.start(now);
      subOsc.stop(now + 0.3);
    } catch (e) {}
  }

  // 摇骰子 / 随机惩罚抽取音效
  playDice() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      this.vibrate('dice');
      const now = this.ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        const time = now + i * 0.05;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(this._jitter(300 + Math.random() * 400), time);

        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

        osc.connect(gain);
        gain.connect(this.getMasterOut());
        osc.start(time);
        osc.stop(time + 0.03);
      }
    } catch (e) {}
  }

  // 换新词 / 翻牌音效
  playDeal() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      this.vibrate('deal');
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(this._jitter(400), now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(this.getMasterOut());
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}
  }

  // 成功开局和弦
  playFanfare() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      this.vibrate('fanfare');
      const notes = [440, 554.37, 659.25, 880]; // A大调和弦
      const now = this.ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.15, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);

        osc.connect(gain);
        gain.connect(this.getMasterOut());
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.35);
      });
    } catch (e) {}
  }
}

window.sfx = new SoundEffects();
