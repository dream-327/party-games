// 间谍危机 (Spyfall) - Web Audio API 纯原生音效合成引擎
// 零外部音频文件依赖，高保真微秒级低延迟

class SoundEffects {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
                       (typeof global !== 'undefined' && global.AudioContext);
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(name) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    switch (name) {
      case 'tick':
        this.playTick();
        break;
      case 'card':
        this.playCard();
        break;
      case 'alarm':
        this.playAlarm();
        break;
      case 'victory':
        this.playVictory();
        break;
      case 'defeat':
        this.playDefeat();
        break;
      case 'click':
        this.playClick();
        break;
      default:
        this.playClick();
    }
  }

  // 倒计时秒针跳动嘀嗒声
  playTick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.03);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  // 翻看身份卡牌滑动声
  playCard() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, this.ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  // 指控与紧急警报警笛声
  playAlarm() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    // 双音交替急促警笛
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(750, now);
    osc.frequency.linearRampToValueAtTime(950, now + 0.1);
    osc.frequency.linearRampToValueAtTime(750, now + 0.2);
    osc.frequency.linearRampToValueAtTime(950, now + 0.3);
    osc.frequency.linearRampToValueAtTime(600, now + 0.45);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);

    this.vibrate('urgent');
  }

  // 获胜欢呼琶音
  playVictory() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);

      gain.gain.setValueAtTime(0.22, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.3);
    });

    this.vibrate('win');
  }

  // 失败低沉重音
  playDefeat() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.65);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.65);

    this.vibrate('error');
  }

  // 通用按钮轻触声
  playClick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(350, this.ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);

    this.vibrate('light');
  }

  // 移动端轻量触觉振动 (Vibration API)
  vibrate(type = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return false;
    try {
      const patterns = {
        light: 15,
        tick: 20,
        urgent: [50, 40, 50, 40, 80],
        win: [100, 50, 100, 50, 200],
        error: [120, 60, 150]
      };
      const pattern = patterns[type] || type;
      return navigator.vibrate(pattern);
    } catch (e) {
      return false;
    }
  }
}

const sfx = new SoundEffects();

if (typeof window !== 'undefined') {
  window.SoundEffects = SoundEffects;
  window.sfx = sfx;
  // 用户首次交互后解锁音频上下文
  if (typeof window.addEventListener === 'function') {
    ['click', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, () => sfx.init(), { once: true, passive: true });
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SoundEffects, sfx };
}
