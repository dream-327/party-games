// Werewolf Sound Effects Engine (纯 Web Audio 原生合成音效)
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

  function playTone(freq, type = 'sine', duration = 0.2, gainVal = 0.2) {
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
    } catch (e) {}
  }

  const sfx = {
    toggleSound: function() {
      isSoundEnabled = !isSoundEnabled;
      return isSoundEnabled;
    },
    isSoundEnabled: function() {
      return isSoundEnabled;
    },

    // 狼嚎声 (天黑请闭眼)
    playHowl: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.6);
        osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 1.6);

        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1.8);
      } catch (e) {}
    },

    // 公鸡打鸣/天亮号角 (天亮了)
    playDawn: function() {
      if (!isSoundEnabled) return;
      const notes = [440, 554, 659, 880];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.2, 0.25), idx * 120);
      });
    },

    // 处决法槌/洪钟声
    playGavel: function() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.8);

        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      } catch (e) {}
    },

    // 换牌/摸牌微声
    playSwap: function() {
      playTone(480, 'sine', 0.08, 0.15);
      setTimeout(() => playTone(640, 'sine', 0.08, 0.15), 60);
    },

    // 投票记录音
    playVote: function() {
      playTone(350, 'triangle', 0.1, 0.2);
    },

    // 倒计时嘀嗒
    playTick: function() {
      playTone(800, 'sine', 0.04, 0.08);
    },

    // 胜利号角
    playWin: function() {
      if (!isSoundEnabled) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.35, 0.25), idx * 140);
      });
    },

    // 电子法官旁白朗读 (TTS 语音播报)
    speak: function(text) {
      if (!isSoundEnabled || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'zh-CN';
        utter.rate = 1.05;
        utter.pitch = 0.92;
        window.speechSynthesis.speak(utter);
      } catch (e) {}
    }
  };

  window.sfx = sfx;
})();
