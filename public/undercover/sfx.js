// 纯 Web Audio API 音效引擎（无需加载任何外部音频文件，零延迟，即开即用）
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this.voiceEnabled = false; // TTS Voice, default false

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
        // Master Gain Bus & Limiter to prevent clipping distortion
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

  // Audio Design: Pitch jitter to prevent robotic monotony
  _jitter(freq, ratio = 0.035) {
    return freq * (1 + (Math.random() * 2 - 1) * ratio);
  }

  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const baseFreq = this._jitter(800);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.getMasterOut());

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
    this.vibrate('click');
  }

  playFlip() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const startFreq = this._jitter(300);
    const endFreq = this._jitter(800);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.getMasterOut());

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
    this.vibrate('light');
  }

  playTick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const tickFreq = this._jitter(950);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(tickFreq, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.getMasterOut());

    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  playDing() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, this.ctx.currentTime); // C6
    osc.frequency.exponentialRampToValueAtTime(523.25, this.ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.getMasterOut());

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
    this.vibrate('turn');
  }

  playVote() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(this._jitter(220), this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.getMasterOut());

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
    this.vibrate('vote');
  }

  playElimination() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    // 触发触觉震动与视觉屏幕震颤反馈 (Game Feel / Juice)
    this.vibrate('eliminated');
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('screen-shake');
      void document.body.offsetWidth;
      document.body.classList.add('screen-shake');
      setTimeout(() => document.body.classList.remove('screen-shake'), 500);
    }

    // 低沉锣声 / 淘汰重音
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + 0.8);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(this.getMasterOut());

    osc.start();
    osc.stop(this.ctx.currentTime + 0.8);
  }

  playVictory() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    this.vibrate('win');
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.12);

      gain.gain.setValueAtTime(0.25, this.ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.12 + 0.35);

      osc.connect(gain);
      gain.connect(this.getMasterOut());

      osc.start(this.ctx.currentTime + i * 0.12);
      osc.stop(this.ctx.currentTime + i * 0.12 + 0.35);
    });
  }

  playPop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this._jitter(400), this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.getMasterOut());

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  // 电子法官旁白朗读 (TTS 语音播报)
  speak(text) {
    if (!this.voiceEnabled || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = 1.05;
      utter.pitch = 0.95;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  // 移动端触感反馈 (Haptic Vibration API)
  vibrate(type = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return false;
    try {
      const patterns = {
        light: 20,
        click: 25,
        vote: [40, 30, 40],
        turn: [100, 50, 100],
        urgent: [50, 50, 50, 50, 80],
        eliminated: [250, 100, 250, 100, 400],
        win: [120, 60, 120, 60, 200, 80, 300],
        warn: [80, 40, 80],
        error: [150, 80, 150]
      };
      const pattern = patterns[type] || type;
      return navigator.vibrate(pattern);
    } catch (e) {
      return false;
    }
  }
}

window.sfx = new SoundEffects();
window.vibrate = (type) => window.sfx.vibrate(type);
window.vibrateFeedback = (type) => window.sfx.vibrate(type);

