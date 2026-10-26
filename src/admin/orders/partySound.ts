// The big order party's sound and buzz (admin only). A Nashik dhol-tasha pathak plays on the beat
// the pouches dance to (120 bpm): the big dhol, the tasha's fast rolls over it, and the jhanj.
// It's made with Web Audio, so there's no file to download. Android phones also buzz with it
// (iPhones have no vibration for web pages).
//
// Sound can only start from a tap: call unlockPartySound() inside the tap's own handler
// ("Big order?", "Party again", Save), and the party plays it once it's on screen. On iPhone it
// follows the silent switch (an 'ambient' audio session). "Sound off" in the party is
// remembered on the device. The beats and the buzz are pure and tested.

/** dhol: the big head; tipru: the stick on the other head; tasha: the small drum's crack; jhanj: the cymbals. */
export type Drum = 'dhol' | 'tipru' | 'tasha' | 'jhanj';
export type PartyKind = 'party' | 'saved';
/** The beat options. One ships; the others are here only while choosing. */
export type Style = 'pathak' | 'dhol' | 'build' | 'tihai';
export const STYLES: Style[] = ['pathak', 'dhol', 'build', 'tihai'];

export interface Hit {
  /** Seconds from the start. */
  at: number;
  drum: Drum;
  /** 0 to 1. */
  level: number;
}

/** A sixteenth at 120 bpm: the dancers move every 500 ms, four sixteenths a beat. */
const STEP = 0.125;
const BAR = 16 * STEP;
/** Where the beat starts: after the tasha roll that goes with the poppers. */
const BEAT_AT = 0.6;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** One bar of a pattern, in sixteenths, from strings like 'X..x..X.' (X loud, x soft, . rest). */
const bar = (hits: Hit[], start: number, drum: Drum, steps: string, loud = 1, soft = 0.55) => {
  [...steps].forEach((c, i) => {
    if (c === 'X' || c === 'x') hits.push({ at: round(start + i * STEP), drum, level: c === 'X' ? loud : soft });
  });
};

/** The tasha's roll: strokes closing in and getting louder, from `from` for `length` seconds. */
const roll = (hits: Hit[], from: number, length: number, quiet = 0.3, loud = 0.9) => {
  const strokes = Math.max(2, Math.round(length / 0.05));
  for (let i = 0; i < strokes; i++) {
    hits.push({ at: round(from + (i * length) / strokes), drum: 'tasha', level: round(quiet + ((loud - quiet) * i) / (strokes - 1)) });
  }
};

/** The pathak's groove, one bar: the dhol's 3-3-2, the stick between, the tasha in sixteenths, the jhanj on the beats. */
const pathakBar = (hits: Hit[], start: number, { tasha = true } = {}) => {
  bar(hits, start, 'dhol', 'X..x..X.X..x..X.');
  bar(hits, start, 'tipru', '..x..x....x..x..', 0.6, 0.5);
  if (tasha) bar(hits, start, 'tasha', 'xxxXxxxXxxxXxxXX', 0.75, 0.3);
  bar(hits, start, 'jhanj', 'X...x...X...x...', 0.8, 0.45);
};

/** The last stroke: everything at once. */
const finale = (hits: Hit[], at: number) => {
  for (const drum of ['dhol', 'tipru', 'tasha', 'jhanj'] as Drum[]) hits.push({ at: round(at), drum, level: 1 });
};

/** Three strokes, three times, the last landing on `end`: a tihai. */
const tihai = (hits: Hit[], end: number) => {
  const gap = STEP;
  const group = 3 * gap + 2 * gap;
  for (let g = 0; g < 3; g++) {
    for (let s = 0; s < 3; s++) {
      const at = end - (2 - g) * group - (2 - s) * gap;
      hits.push({ at: round(at), drum: 'dhol', level: s === 2 ? 1 : 0.8 }, { at: round(at), drum: 'tasha', level: 0.8 });
    }
  }
  hits.push({ at: round(end), drum: 'jhanj', level: 1 });
};

/** The sound for a party: a tasha roll with the poppers, the style's beat, and one last stroke. */
export const dholHits = (kind: PartyKind, style: Style = 'pathak'): Hit[] => {
  const hits: Hit[] = [];
  roll(hits, 0.1, 0.45);
  const bars = kind === 'party' ? 4 : 1;
  const end = BEAT_AT + bars * BAR;
  if (style === 'pathak' || kind === 'saved') {
    for (let b = 0; b < bars; b++) pathakBar(hits, BEAT_AT + b * BAR);
    finale(hits, end);
  } else if (style === 'dhol') {
    // Just the big drum and the jhanj: deep and roomy, nothing fast.
    for (let b = 0; b < bars; b++) {
      bar(hits, BEAT_AT + b * BAR, 'dhol', 'X...X...X..xX...');
      bar(hits, BEAT_AT + b * BAR, 'jhanj', 'X.......X.......', 0.7);
    }
    hits.push({ at: round(end), drum: 'dhol', level: 1 }, { at: round(end), drum: 'jhanj', level: 1 });
  } else if (style === 'build') {
    // A procession starting: two bars of tasha and jhanj rising, then the whole pathak.
    roll(hits, BEAT_AT, BAR, 0.25, 0.6);
    roll(hits, BEAT_AT + BAR, BAR, 0.5, 1);
    for (let i = 0; i < 4; i++) hits.push({ at: round(BEAT_AT + i * (BAR / 2)), drum: 'jhanj', level: round(0.3 + i * 0.15) });
    for (let b = 2; b < bars; b++) pathakBar(hits, BEAT_AT + b * BAR);
    finale(hits, end);
  } else {
    // Two bars of pathak, then a tihai to close.
    for (let b = 0; b < 2; b++) pathakBar(hits, BEAT_AT + b * BAR);
    // A breath of two sixteenths, then the tihai: three groups of three, the last stroke closing it.
    tihai(hits, BEAT_AT + 2 * BAR + 2 * STEP + 12 * STEP);
    return hits.sort((a, b) => a.at - b.at);
  }
  return hits.sort((a, b) => a.at - b.at);
};

/** How long it rings, last stroke included. */
export const dholLength = (hits: Hit[]): number => Math.max(...hits.map((h) => h.at)) + 0.9;

/**
 * The buzz, as vibrate()'s on/off list in ms: a burst for the poppers, then a short tap on each
 * loud dhol stroke up to `until` seconds, so the phone thumps with the drum and then rests.
 */
export const buzzPattern = (hits: Hit[], until: number): number[] => {
  const pattern = [40, 30, 90];
  let clock = 0.16;
  for (const h of hits) {
    if (h.drum !== 'dhol' || h.level < 0.8 || h.at < clock || h.at > until) continue;
    pattern.push(Math.round((h.at - clock) * 1000), 30);
    clock = h.at + 0.03;
  }
  return pattern;
};

// ---- The drums -------------------------------------------------------------------------

const noiseFor = new WeakMap<BaseAudioContext, AudioBuffer>();
const noise = (ctx: BaseAudioContext) => {
  let buffer = noiseFor.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.6), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseFor.set(ctx, buffer);
  }
  return buffer;
};

/** A quick rise and a long fall, so no stroke clicks. */
const envelope = (ctx: BaseAudioContext, t: number, peak: number, fall: number) => {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + fall);
  return gain;
};

const burst = (ctx: BaseAudioContext, out: AudioNode, t: number, filters: BiquadFilterNode[], peak: number, fall: number) => {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  let node: AudioNode = src;
  for (const f of filters) node = node.connect(f);
  node.connect(envelope(ctx, t, peak, fall)).connect(out);
  src.start(t);
  src.stop(t + fall + 0.02);
};

const filter = (ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.8) => {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
};

const tone = (ctx: BaseAudioContext, out: AudioNode, t: number, type: OscillatorType, from: number, to: number, peak: number, fall: number) => {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + fall * 0.5);
  osc.connect(envelope(ctx, t, peak, fall)).connect(out);
  osc.start(t);
  osc.stop(t + fall + 0.02);
};

const strike: Record<Drum, (ctx: BaseAudioContext, out: AudioNode, t: number, v: number) => void> = {
  // The Nashik dhol's big head: deep, with a boom that drops, and the skin's thud.
  dhol: (ctx, out, t, v) => {
    tone(ctx, out, t, 'sine', 90, 42, 1.1 * v, 0.75);
    tone(ctx, out, t, 'triangle', 140, 70, 0.35 * v, 0.25);
    burst(ctx, out, t, [filter(ctx, 'lowpass', 420)], 0.6 * v, 0.08);
  },
  // The stick (tipru) on the dhol's other head: a dry crack with a short ring.
  tipru: (ctx, out, t, v) => {
    burst(ctx, out, t, [filter(ctx, 'bandpass', 1700, 1.4)], 1.2 * v, 0.07);
    tone(ctx, out, t, 'triangle', 340, 300, 0.4 * v, 0.1);
  },
  // The tasha: bright and hard, a snap more than a tone.
  tasha: (ctx, out, t, v) => {
    burst(ctx, out, t, [filter(ctx, 'highpass', 2500), filter(ctx, 'peaking', 5200, 2)], 1.5 * v, 0.05);
    tone(ctx, out, t, 'square', 880, 840, 0.08 * v, 0.05);
  },
  // The jhanj: a bright splash with a few metal overtones ringing off.
  jhanj: (ctx, out, t, v) => {
    burst(ctx, out, t, [filter(ctx, 'highpass', 5000)], 0.5 * v, 0.45);
    for (const f of [820, 1210, 1690, 2370]) tone(ctx, out, t, 'square', f, f * 0.995, 0.025 * v, 0.35);
  },
};

/** Puts every stroke on the context's clock from `startAt`. Returns the volume, to fade it out. */
export const scheduleDhol = (ctx: BaseAudioContext, destination: AudioNode, hits: Hit[], startAt: number): GainNode => {
  const volume = ctx.createGain();
  volume.gain.value = 0.5;
  // A limiter, then a trim: the compressor adds its own make-up gain, so the trim keeps the peaks under full scale.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const trim = ctx.createGain();
  trim.gain.value = 0.7;
  volume.connect(limiter).connect(trim).connect(destination);
  for (const hit of hits) strike[hit.drum](ctx, volume, startAt + hit.at, hit.level);
  return volume;
};

// ---- On the phone ----------------------------------------------------------------------

const SOUND_KEY = 'shahs-admin-party-sound';
let audio: AudioContext | null = null;

/** Sound is on unless they turned it off on this device. Storage that throws counts as on. */
export const partySoundOn = (): boolean => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setPartySoundOn = (on: boolean): void => {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered; the choice still holds for this party.
  }
};

/** Call inside a tap's handler: browsers only let sound start from one. */
export const unlockPartySound = (): void => {
  if (!partySoundOn()) return;
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  try {
    // iPhone: follow the silent switch, and mix with music instead of stopping it.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    audio ??= new Context();
    if (audio.state !== 'running') void audio.resume().catch(() => {});
  } catch {
    audio = null;
  }
};

const buzz = (pattern: number[] | 0) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // No vibration here (iPhone, laptops).
  }
};

/**
 * Plays the dhol (if sound is on and was unlocked) and the buzz. Returns the stop, which fades
 * the drums out and stops the buzz: the party calls it when it closes.
 */
export const playParty = (kind: PartyKind, { withBuzz = true } = {}): (() => void) => {
  const hits = dholHits(kind);
  const ctx = audio;
  const volume = ctx && partySoundOn() ? scheduleDhol(ctx, ctx.destination, hits, ctx.currentTime + 0.02) : null;
  if (withBuzz) buzz(buzzPattern(hits, kind === 'party' ? 2.6 : 1.2));
  return () => {
    if (withBuzz) buzz(0);
    if (!ctx || !volume) return;
    volume.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => volume.disconnect(), 400);
  };
};
