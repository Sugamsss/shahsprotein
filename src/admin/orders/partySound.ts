// The big order party's sound and buzz (admin only): ten seconds of a real Maharashtrian dhol,
// "Maharashtrian Dhol Perform 001" by Satyam Vishwakarma (Wikimedia Commons, CC BY-SA 4.0),
// trimmed and levelled. The credit is in Settings and in public/assets/sounds/CREDITS.md; keep
// both if the clip changes. Android phones also buzz with its drum hits (iPhones have no
// vibration for web pages).
//
// Sound can only start from a tap: call unlockPartySound() inside the tap's own handler
// ("Big order?", "Party again", Save), and the party plays it once it's on screen. Add order
// fetches the clip ahead (prefetchPartySound), so it's there on the tap. On iPhone it follows the
// silent switch (an 'ambient' audio session). "Sound off" in the party is remembered on the device.

export type PartyKind = 'party' | 'saved';

/** A new file name if the clip ever changes: /assets is cached for a year. */
export const DHOL_URL = '/assets/sounds/maharashtrian-dhol-v1.mp3';

/** Seconds of the clip each party plays: all of it, or its first three when a big order is saved. */
export const PLAY_FOR: Record<PartyKind, number> = { party: 10, saved: 3 };

/** The clip's loud drum hits in its first seconds, measured from the file, for the buzz. */
export const DHOL_HITS = [0.31, 0.71, 1.19, 1.5, 1.71, 1.93, 2.31, 2.52];

/**
 * The buzz, as vibrate()'s on/off list in ms: a burst for the poppers, then a short tap on each
 * drum hit up to `until` seconds, so the phone thumps with the dhol and then rests.
 */
export const buzzPattern = (hits: number[], until: number): number[] => {
  const pattern = [40, 30, 90];
  let clock = 0.16;
  for (const at of hits) {
    if (at < clock || at > until) continue;
    pattern.push(Math.round((at - clock) * 1000), 30);
    clock = at + 0.03;
  }
  return pattern;
};

// ---- On the phone ----------------------------------------------------------------------

const SOUND_KEY = 'shahs-admin-party-sound';
let audio: AudioContext | null = null;
let file: Promise<ArrayBuffer> | null = null;
let clip: Promise<AudioBuffer> | null = null;

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

/** Fetches the clip (80 KB) once, so a party never waits on the network. A failure is retried next time. */
export const prefetchPartySound = (): void => {
  if (file || !partySoundOn() || typeof fetch !== 'function') return;
  file = fetch(DHOL_URL).then((r) => {
    if (!r.ok) throw new Error(`dhol ${r.status}`);
    return r.arrayBuffer();
  });
  file.catch(() => {
    file = null;
  });
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
    prefetchPartySound();
    if (!clip && file) {
      const ctx = audio;
      // A copy: decoding takes the buffer over, and the fetched one may be needed again.
      clip = file.then((bytes) => ctx.decodeAudioData(bytes.slice(0)));
      clip.catch(() => {
        clip = null;
      });
    }
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
  const ctx = audio;
  const length = PLAY_FOR[kind];
  let stopped = false;
  let volume: GainNode | null = null;
  if (ctx && clip && partySoundOn()) {
    clip.then((buffer) => {
      if (stopped) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      volume = ctx.createGain();
      const start = ctx.currentTime + 0.02;
      const play = Math.min(length, buffer.duration);
      // The short one fades over its last half second; the whole clip already fades out by itself.
      if (play < buffer.duration) volume.gain.setTargetAtTime(0, start + play - 0.5, 0.15);
      source.connect(volume).connect(ctx.destination);
      source.start(start, 0, play);
    }, () => {});
  }
  if (withBuzz) buzz(buzzPattern(DHOL_HITS, kind === 'party' ? 2.6 : 1.2));
  return () => {
    stopped = true;
    if (withBuzz) buzz(0);
    const gain = volume;
    if (!ctx || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => gain.disconnect(), 400);
  };
};
