import { melodyFromTrack } from './midi.js';

export const TRANSCRIPTION_RATE = 22050;
export const MAX_AUDIO_BYTES = 40_000_000;
export const MAX_AUDIO_SECONDS = 600;
export const MAX_CLIP_SECONDS = 60;

/** @typedef {{ startTimeSeconds: number, durationSeconds: number, pitchMidi: number, amplitude: number }} DetectedNote */
/** @typedef {{ samples: Float32Array<ArrayBuffer>, modelUrl: string }} TranscriptionRequest */
/** @typedef {{ kind: 'progress', percent: number, stage: string } | { kind: 'result', notes: DetectedNote[] } | { kind: 'error', message: string }} TranscriptionMessage */

/** @param {number} start @param {number} end @param {number} duration @param {number} bpm */
export function validateAudioSection(start, end, duration, bpm) {
  if (![start, end, duration, bpm].every(Number.isFinite)) throw new Error('Enter valid start, end, and tempo values.');
  if (duration <= 0 || duration > MAX_AUDIO_SECONDS) throw new Error('Use an audio file between 0 and 10 minutes long. Trim longer files first.');
  if (start < 0 || end > duration || end - start < 0.5 || end - start > MAX_CLIP_SECONDS) {
    throw new Error('Choose a section between 0.5 and 60 seconds, within the audio file.');
  }
  if (bpm < 30 || bpm > 240) throw new Error('Lesson tempo must be between 30 and 240 BPM.');
}

/** @param {AudioBuffer} buffer @param {number} start @param {number} end */
export function monoSection(buffer, start, end) {
  validateAudioSection(start, end, buffer.duration, 72);
  if (buffer.sampleRate !== TRANSCRIPTION_RATE) throw new Error('The browser did not decode audio at the required 22050 Hz sample rate.');
  const from = Math.round(start * buffer.sampleRate);
  const count = Math.min(buffer.length - from, Math.round((end - start) * buffer.sampleRate));
  const result = new Float32Array(count);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < count; i++) result[i] += samples[from + i] / buffer.numberOfChannels;
  }
  let peak = 0;
  for (const value of result) peak = Math.max(peak, Math.abs(value));
  if (peak < 0.0001) throw new Error('This section is silent. Choose a section containing clear pitched audio.');
  return result;
}

/** @param {DetectedNote[]} detected @param {number} duration @param {number} bpm @param {boolean} middleOnly */
export function draftFromDetection(detected, duration, bpm, middleOnly = false) {
  validateAudioSection(0, duration, duration, bpm);
  if (!Array.isArray(detected) || detected.length > 10000) throw new Error('The model returned too many events. Choose a shorter or cleaner recording.');
  const candidates = detected.map((note, id) => {
    if (![note.startTimeSeconds, note.durationSeconds, note.pitchMidi, note.amplitude].every(Number.isFinite) ||
      !Number.isInteger(note.pitchMidi) || note.durationSeconds <= 0) throw new Error('The transcription model returned an invalid note.');
    return {
      id, midi: note.pitchMidi, amplitude: note.amplitude,
      start: Math.max(0, note.startTimeSeconds),
      end: Math.min(duration, note.startTimeSeconds + note.durationSeconds)
    };
  }).filter((note) => note.end - note.start >= 0.09 && note.amplitude >= 0.3 &&
    note.midi >= (middleOnly ? 48 : 21) && note.midi <= (middleOnly ? 84 : 108));
  if (!candidates.length) throw new Error('No clear piano-range notes were found. Try a clean solo instrument, another section, or the full piano range.');
  const boundaries = [...new Set(candidates.flatMap((note) => [note.start, note.end]))].sort((a, b) => a - b);
  const byStart = [...candidates].sort((a, b) => a.start - b.start);
  /** @type {Map<number, typeof candidates[number]>} */
  const active = new Map();
  let cursor = 0;
  /** @type {{ id: number, midi: number, start: number, end: number }[]} */
  const segments = [];
  let overlaps = false;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    while (cursor < byStart.length && byStart[cursor].start <= start) {
      const note = byStart[cursor++];
      active.set(note.id, note);
    }
    for (const [id, note] of active) if (note.end <= start) active.delete(id);
    if (!active.size) continue;
    if (active.size > 1) overlaps = true;
    const chosen = [...active.values()].reduce((best, note) => note.midi > best.midi || (note.midi === best.midi && note.amplitude > best.amplitude) ? note : best);
    const previous = segments.at(-1);
    if (previous?.id === chosen.id && previous.end === start) previous.end = end;
    else segments.push({ id: chosen.id, midi: chosen.midi, start, end });
  }
  const sustained = segments.filter((segment) => segment.end - segment.start >= 0.09);
  if (!sustained.length) throw new Error('Only very short note fragments were detected. Try a clearer section.');
  const ticksPerSecond = 480 * bpm / 60;
  const track = {
    name: 'Audio transcription draft',
    notes: sustained.map((note) => ({
      midi: note.midi,
      tick: Math.round(note.start * ticksPerSecond),
      end: Math.round(note.end * ticksPerSecond)
    }))
  };
  const { notes } = melodyFromTrack(track, 480);
  return { notes, detected: detected.length, filtered: detected.length - candidates.length, overlaps };
}
