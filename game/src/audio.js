// audio.js — every sound in Ember Isle is synthesized live with WebAudio.
// No audio files, no network: oscillators and filtered noise, plus an original
// volcanic groove — a D-minor bass walk with a bright, ember-coloured lead.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = 0;
    this.musicTimer = 0;
    this.step = 0;
    this.started = false;
  }

  // Browsers only allow audio after a user gesture; call from any click/key.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.15;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      // Engine hum: a sawtooth whose pitch follows speed, started once.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 52;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp);
      lp.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.started = true;
    } catch (e) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  setEngine(speed01, on) {
    if (!this.ctx || !this.engineOsc) return;
    const target = on ? 0.05 + speed01 * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 122, this.ctx.currentTime, 0.06);
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }

  shot() {
    this.noise(0.12, 0.5, 2600);
    this.blip(160, 0.1, 'square', 0.22, 55);
  }

  hit() {
    this.noise(0.08, 0.25, 900);
  }

  crash() {
    this.noise(0.3, 0.5, 500);
    this.blip(70, 0.25, 'sawtooth', 0.3, 35);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.25);
    setTimeout(() => this.blip(990, 0.14, 'sine', 0.25), 70);
  }

  cash() {
    this.blip(880, 0.08, 'triangle', 0.22);
    setTimeout(() => this.blip(1174, 0.1, 'triangle', 0.22), 80);
    setTimeout(() => this.blip(1568, 0.18, 'triangle', 0.2), 160);
  }

  fail() {
    this.blip(220, 0.25, 'sawtooth', 0.2, 110);
    setTimeout(() => this.blip(165, 0.35, 'sawtooth', 0.2, 82), 180);
  }

  jingle() {
    const notes = [587, 698, 880, 1174];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.24), i * 110));
  }

  // A race countdown beep: low for 3-2-1, high for GO.
  countBeep(go) {
    this.blip(go ? 880 : 440, go ? 0.3 : 0.12, 'square', 0.22);
  }

  siren(dt) {
    if (!this.ctx || this.muted) return;
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 0.42;
      this.blip(this.sirenTimer % 0.84 < 0.42 ? 720 : 540, 0.36, 'sine', 0.05);
    }
  }

  // Original groove: D-minor bass walk with a bright pentatonic lead.
  // Called every frame; schedules one 8th-note step when its time comes.
  music(dt, intensity) {
    if (!this.ctx || this.muted || !this.started) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.21;
    const bass = [73.4, 0, 73.4, 0, 87.3, 0, 65.4, 0, 73.4, 0, 73.4, 0, 98, 0, 110, 0];
    const lead = [0, 587, 0, 698, 0, 0, 880, 0, 0, 698, 0, 784, 0, 0, 1046, 0];
    const s = this.step % 16;
    const b = bass[s];
    if (b) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = b;
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.22);
    }
    const l = lead[s];
    if (l && intensity > 0.25) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = l;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.2);
    }
    this.step++;
  }
}
