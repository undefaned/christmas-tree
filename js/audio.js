// Tiny WebAudio music box — Jingle Bells (public domain), no audio files.
const N = {
  C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
  C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81,
};

// [note, beats] — one full chorus, then looped.
const MELODY = [
  ['E5', 1], ['E5', 1], ['E5', 2],
  ['E5', 1], ['E5', 1], ['E5', 2],
  ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4],
  ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5],
  ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 1],
  ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1],
  ['D5', 2], ['G5', 2],

  ['E5', 1], ['E5', 1], ['E5', 2],
  ['E5', 1], ['E5', 1], ['E5', 2],
  ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4],
  ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5],
  ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 1],
  ['G5', 1], ['G5', 1], ['F5', 1], ['D5', 1],
  ['C5', 4],
];

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class MusicBox {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.delay = null;
    this.playing = false;
    this.timer = null;
    this.nextTime = 0;
    this.step = 0;
    this.beat = 0.42;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no WebAudio');
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.34;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.24;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.22;

    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(this.master);

    this.master.connect(comp);
    comp.connect(this.ctx.destination);
  }

  _bell(freq, at, dur) {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.42, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.5, dur * 1.5));

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = freq;

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.005;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;

    o1.connect(env);
    o2.connect(g2);
    g2.connect(env);

    env.connect(this.master);
    env.connect(this.delay);

    const stopAt = at + Math.max(0.8, dur * 1.6);
    o1.start(at);
    o2.start(at);
    o1.stop(stopAt);
    o2.stop(stopAt);
  }

  _tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    // if the tab was asleep, don't fire a burst of catch-up notes
    if (this.nextTime < now - 0.6) this.nextTime = now + 0.1;
    while (this.nextTime < now + 0.45) {
      const [name, beats] = MELODY[this.step];
      const freq = midiToHz(N[name]);
      const dur = beats * this.beat;
      this._bell(freq, this.nextTime, dur);
      this.nextTime += dur;
      this.step = (this.step + 1) % MELODY.length;
    }
  }

  async start() {
    this._ensure();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.playing) return;
    this.playing = true;
    this.nextTime = this.ctx.currentTime + 0.12;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), this.ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(0.16, this.ctx.currentTime + 0.8);
    this._tick();
    this.timer = setInterval(() => this._tick(), 140);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), this.ctx.currentTime);
      this.master.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.45);
    }
  }

  async toggle() {
    if (this.playing) this.stop();
    else await this.start();
    return this.playing;
  }
}
