/** @typedef {{ midi: number | null, beats: number }} Step */
/** @typedef {{ id: string, title: string, description: string, bpm: number, notes: Step[], reference: string, tutorial?: string, source: string }} Song */
/** @typedef {{ correct: number, attempts: number, completed: number, furthest: number, seconds: number, lastPlayed: string }} Progress */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const MAX_STEPS = 512;

/** @param {number} midi */
export function noteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** @param {number} midi */
export function frequencyForNote(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** @param {number} frequency */
export function noteForFrequency(frequency) {
  const exact = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}

/** @param {string} text @returns {Step[]} */
export function parseNotes(text) {
  if (!text.trim()) return [];
  const tokens = text.trim().split(/[\s,]+/);
  if (tokens.length > MAX_STEPS) throw new Error(`Keep an arrangement to ${MAX_STEPS} notes and rests or fewer.`);
  const offsets = /** @type {Record<string, number>} */ ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
  return tokens.map((token) => {
    const match = /^(R|[A-G](?:#|b)?[0-8])(?::(\d+(?:\.\d+)?))?$/i.exec(token);
    if (!match) throw new Error(`"${token}" isn't a note. Try C4, F#4, Bb3, or R:1 for a rest.`);
    const beats = match[2] ? Number(match[2]) : 1;
    if (beats < 1 / 64 || beats > 64) throw new Error(`"${token}" needs a duration from 0.015625 to 64 beats.`);
    if (match[1].toUpperCase() === 'R') return { midi: null, beats };
    const name = match[1];
    const accidental = name[1] === '#' ? 1 : name[1]?.toLowerCase() === 'b' ? -1 : 0;
    const midi = (Number(name.at(-1)) + 1) * 12 + offsets[name[0].toUpperCase()] + accidental;
    if (midi < 21 || midi > 108) throw new Error(`"${token}" is outside a standard piano's A0-C8 range.`);
    return { midi, beats };
  });
}

/** @param {Step[]} notes */
export function formatNotes(notes) {
  return notes.map(({ midi, beats }) => `${midi === null ? 'R' : noteName(midi)}${beats === 1 ? '' : `:${Number(beats.toFixed(6))}`}`).join(' ');
}

/** @param {string} value */
export function referenceUrl(value) {
  if (!value.trim()) return '';
  let url;
  try { url = new URL(value); }
  catch { throw new Error('Enter a full YouTube URL, starting with https://.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a secure https:// YouTube link.');
  let id;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed)\/([^/]+)$/.exec(url.pathname)?.[1];
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Use a link to one YouTube video, not a channel or playlist.');
  return `https://www.youtube.com/watch?v=${id}`;
}

/** @param {unknown} value @returns {Song} */
export function validateSong(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid song data.');
  const s = /** @type {Record<string, unknown>} */ (value);
  if (typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(s.id)) throw new Error('Invalid song ID.');
  if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 100) throw new Error('Give your song a title of 1-100 characters.');
  if (typeof s.bpm !== 'number' || !Number.isFinite(s.bpm) || s.bpm < 30 || s.bpm > 240) throw new Error('Tempo must be between 30 and 240 BPM.');
  if (!Array.isArray(s.notes) || s.notes.length > MAX_STEPS) throw new Error(`A song can have up to ${MAX_STEPS} notes and rests.`);
  const notes = s.notes.map((n) => {
    if (!n || typeof n !== 'object' ||
      (n.midi !== null && (!Number.isInteger(n.midi) || n.midi < 21 || n.midi > 108)) ||
      typeof n.beats !== 'number' || !Number.isFinite(n.beats) || n.beats < 1 / 64 || n.beats > 64) {
      throw new Error('A song contains an invalid note or duration.');
    }
    return { midi: /** @type {number | null} */ (n.midi), beats: /** @type {number} */ (n.beats) };
  });
  if (notes.length && !notes.some((n) => n.midi !== null)) throw new Error('Add at least one piano note, not only rests.');
  if (typeof s.reference !== 'string' || s.reference.length > 2048) throw new Error('Invalid reference link.');
  if (s.tutorial !== undefined && (typeof s.tutorial !== 'string' || s.tutorial.length > 2048)) throw new Error('Invalid piano tutorial link.');
  if (typeof s.description !== 'string' || s.description.length > 240) throw new Error('Keep the description under 240 characters.');
  if (typeof s.source !== 'string' || s.source.length > 120) throw new Error('Invalid song source.');
  return {
    id: s.id, title: s.title.trim(), description: s.description.trim(), bpm: s.bpm, notes,
    reference: referenceUrl(s.reference), source: s.source,
    ...(typeof s.tutorial === 'string' ? { tutorial: referenceUrl(s.tutorial) } : {})
  };
}

export function emptyProgress() {
  return { correct: 0, attempts: 0, completed: 0, furthest: 0, seconds: 0, lastPlayed: '' };
}

/** Wait-for-note practice; audio and UI stay outside this state machine. */
export class Practice {
  /** @param {Step[]} notes */
  constructor(notes) {
    this.notes = notes;
    this.start = 0;
    this.end = notes.length - 1;
    this.loop = false;
    this.index = this.nextPitched(0);
    this.finished = this.index < 0;
  }

  /** @param {number} from */
  nextPitched(from) {
    for (let i = from; i <= this.end; i++) if (this.notes[i].midi !== null) return i;
    return -1;
  }

  /** @param {number} start @param {number} end @param {boolean} enabled */
  setLoop(start, end, enabled) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= this.notes.length || start > end) {
      throw new Error('Loop start must come before its end, within this arrangement.');
    }
    if (!this.notes.slice(start, end + 1).some((n) => n.midi !== null)) throw new Error('Your loop needs at least one piano note.');
    this.start = enabled ? start : 0;
    this.end = enabled ? end : this.notes.length - 1;
    this.loop = enabled;
    this.restart();
  }

  restart() {
    this.index = this.nextPitched(this.start);
    this.finished = this.index < 0;
  }

  /** @param {number} midi */
  play(midi) {
    if (this.finished) return { correct: false, ignored: true, completed: false, step: this.index };
    const step = this.index;
    if (this.notes[step].midi !== midi) return { correct: false, ignored: false, completed: false, step };
    const next = this.nextPitched(step + 1);
    const completed = next === -1 && !this.loop;
    this.index = next === -1 && this.loop ? this.nextPitched(this.start) : next;
    this.finished = completed;
    return { correct: true, ignored: false, completed, step };
  }
}

/** YIN difference function with parabolic refinement, for one note at a time.
 * @param {Float32Array<ArrayBuffer>} samples @param {number} sampleRate
 * @returns {{ frequency: number, confidence: number, rms: number } | null}
 */
export function detectPitch(samples, sampleRate) {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const rms = Math.sqrt(energy / samples.length);
  if (rms < 0.008) return null;
  const maxLag = Math.min(Math.floor(sampleRate / 55), Math.floor(samples.length / 2) - 1);
  const minLag = Math.max(2, Math.floor(sampleRate / 1760));
  const length = Math.floor(samples.length / 2);
  const difference = new Float32Array(maxLag + 1);
  let running = 0;
  difference[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      const delta = samples[i] - samples[i + lag];
      sum += delta * delta;
    }
    running += sum;
    difference[lag] = running === 0 ? 1 : sum * lag / running;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (difference[lag] >= 0.14) continue;
    while (lag + 1 < maxLag && difference[lag + 1] < difference[lag]) lag++;
    const left = difference[lag - 1];
    const center = difference[lag];
    const right = difference[lag + 1];
    const denominator = 2 * (2 * center - right - left);
    const refined = lag + (denominator === 0 ? 0 : (right - left) / denominator);
    return { frequency: sampleRate / refined, confidence: 1 - center, rms };
  }
  return null;
}

export class NoteGate {
  constructor() {
    /** @type {number | null} */
    this.candidate = null;
    /** @type {number | null} */
    this.accepted = null;
    this.since = 0;
    this.lastSignal = -Infinity;
  }

  /** @param {number | null} midi @param {number} now @returns {number | null} */
  update(midi, now) {
    if (midi === null) {
      this.candidate = null;
      if (now - this.lastSignal >= 140) this.accepted = null;
      return null;
    }
    this.lastSignal = now;
    if (midi !== this.candidate) {
      this.candidate = midi;
      this.since = now;
      return null;
    }
    if (now - this.since >= 100 && this.accepted !== midi) {
      this.accepted = midi;
      return midi;
    }
    return null;
  }
}
