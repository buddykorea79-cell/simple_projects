// 효과음은 파일 없이 Web Audio로 합성한다.
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) { enabled = v; if (!v) stopAll(); }

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

const live = new Set<AudioScheduledSourceNode>();
function track(n: AudioScheduledSourceNode) { live.add(n); n.onended = () => live.delete(n); }
export function stopAll() { for (const n of live) { try { n.stop(); } catch { /* already stopped */ } } live.clear(); }

function tone(freq: number, start: number, dur: number, vol = .15, type: OscillatorType = 'sine') {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + .015);
  g.gain.exponentialRampToValueAtTime(.0008, start + dur);
  o.connect(g).connect(c.destination); o.start(start); o.stop(start + dur + .05); track(o);
}

let noiseBuf: AudioBuffer | null = null;
function noise(start: number, dur: number, vol: number, hp = 1200) {
  const c = ac(); if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * .3, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(.001, start + dur);
  s.connect(f).connect(g).connect(c.destination); s.start(start); s.stop(start + dur + .02); track(s);
}

/** 점점 빨라지고 커지는 스네어 드럼롤 */
export function drumroll(seconds: number) {
  const c = ac(); if (!c) return;
  let t = c.currentTime;
  const end = t + seconds;
  while (t < end) {
    const p = 1 - (end - t) / seconds;
    noise(t, .07, .05 + p * .12);
    t += .075 - p * .04;
  }
}

export function tick() { const c = ac(); if (c) tone(1600, c.currentTime, .04, .04, 'square'); }
export function pop() { const c = ac(); if (!c) return; const t = c.currentTime; tone(660, t, .12, .14, 'triangle'); tone(990, t + .06, .2, .12, 'triangle'); }
export function thud() { const c = ac(); if (!c) return; const t = c.currentTime; tone(110, t, .35, .25, 'sine'); noise(t, .12, .08, 300); }
export function whoosh() { const c = ac(); if (!c) return; noise(c.currentTime, .35, .06, 2500); }
export function fanfare() {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => tone(f, t + i * .12, .3, .13, 'triangle'));
  [523.25, 659.25, 783.99, 1046.5].forEach(f => tone(f, t + .42, 1.2, .1, 'triangle'));
  noise(t + .42, .5, .05, 4000);
}
