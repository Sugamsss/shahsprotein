// The big order party's sound and buzz (admin only). A dhol is played on the beat the pouches
// dance to (120 bpm), made with Web Audio, so there's no file to download. Android phones also
// buzz with it (iPhones have no vibration for web pages).
//
// Sound can only start from a tap: call unlockPartySound() inside the tap's own handler
// ("Big order?", "Party again", Save), and the party plays it once it's on screen. On iPhone it
// follows the silent switch (an 'ambient' audio session). "Sound off" in the party is
// remembered on the device. The hits and the buzz are pure and tested.

export type Drum = 'bass' | 'treble' | 'both';
export type PartyKind = 'party' | 'saved';

export interface Hit {
  /** Seconds from the start. */
  at: number;
  drum: Drum;
  accent?: boolean;
}

/** An eighth note at 120 bpm: the dancers move every 500 ms. */
const EIGHTH = 0.25;
/** One bar of bhangra chaal, in eighths: DHA . na DHA . na DHA na. */
const CHAAL: (Drum | null)[] = ['both', null, 'treble', 'bass', null, 'treble', 'bass', 'treble'];
/** Where the groove starts: after the roll that goes with the poppers. */
const GROOVE_AT = 0.6;

/** The dhol: a roll as the poppers fire, the chaal (four bars at the party, one when saved), then one last DHA. */
export const dholHits = (kind: PartyKind): Hit[] => {
  const hits: Hit[] = [];
  for (let i = 0; i < 6; i++) hits.push({ at: Number((0.1 + i * 0.06).toFixed(2)), drum: 'treble' });
  const bars = kind === 'party' ? 4 : 1;
  for (let bar = 0; bar < bars; bar++) {
    CHAAL.forEach((drum, step) => {
      if (drum) hits.push({ at: GROOVE_AT + (bar * 8 + step) * EIGHTH, drum, accent: step === 0 });
    });
  }
  hits.push({ at: GROOVE_AT + bars * 8 * EIGHTH, drum: 'both', accent: true });
  return hits;
};

/** How long the dhol rings, last hit included. */
export const dholLength = (hits: Hit[]): number => Math.max(...hits.map((h) => h.at)) + 0.6;

/**
 * The buzz, as vibrate()'s on/off list in ms: a burst for the poppers, then a short tap on each
 * bass hit up to `until` seconds, so the phone thumps with the drum and then rests.
 */
export const buzzPattern = (hits: Hit[], until: number): number[] => {
  const pattern = [40, 30, 90];
  let clock = 0.16;
  for (const h of hits) {
    if (h.drum === 'treble' || h.at < clock || h.at > until) continue;
    pattern.push(Math.round((h.at - clock) * 1000), 30);
    clock = h.at + 0.03;
  }
  return pattern;
};

// ---- The drum --------------------------------------------------------------------------

const noiseFor = new WeakMap<BaseAudioContext, AudioBuffer>();
const noise = (ctx: BaseAudioContext) => {
  let buffer = noiseFor.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseFor.set(ctx, buffer);
  }
  return buffer;
};

/** A quick rise and a long fall, so no hit clicks. */
const envelope = (ctx: BaseAudioContext, t: number, peak: number, fall: number) => {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + fall);
  return gain;
};

/** The big head (dagga): a low thump that drops in pitch. */
const bass = (ctx: BaseAudioContext, out: AudioNode, t: number, loud: number) => {
  const tone = ctx.createOscillator();
  tone.frequency.setValueAtTime(120, t);
  tone.frequency.exponentialRampToValueAtTime(55, t + 0.2);
  tone.connect(envelope(ctx, t, 0.9 * loud, 0.5)).connect(out);
  tone.start(t);
  tone.stop(t + 0.55);
};

/** The small head (tilli): the stick's crack, and the skin's short ring. */
const treble = (ctx: BaseAudioContext, out: AudioNode, t: number, loud: number) => {
  const crack = ctx.createBufferSource();
  crack.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2200;
  band.Q.value = 1.2;
  crack.connect(band).connect(envelope(ctx, t, 1.6 * loud, 0.09)).connect(out);
  crack.start(t);
  crack.stop(t + 0.1);
  const ring = ctx.createOscillator();
  ring.type = 'triangle';
  ring.frequency.setValueAtTime(520, t);
  ring.frequency.exponentialRampToValueAtTime(380, t + 0.12);
  ring.connect(envelope(ctx, t, 0.6 * loud, 0.15)).connect(out);
  ring.start(t);
  ring.stop(t + 0.16);
};

/** Puts every hit on the context's clock from `startAt`. Returns the volume, to fade it out. */
export const scheduleDhol = (ctx: BaseAudioContext, destination: AudioNode, hits: Hit[], startAt: number): GainNode => {
  const volume = ctx.createGain();
  volume.gain.value = 0.6;
  const limiter = ctx.createDynamicsCompressor();
  volume.connect(limiter).connect(destination);
  for (const hit of hits) {
    const t = startAt + hit.at;
    const loud = hit.accent ? 1 : 0.7;
    if (hit.drum !== 'treble') bass(ctx, volume, t, loud);
    if (hit.drum !== 'bass') treble(ctx, volume, t, loud);
  }
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
 * the drum out and stops the buzz: the party calls it when it closes.
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
