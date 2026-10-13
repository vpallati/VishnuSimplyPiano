import { MAX_STEPS, validateSong } from './core.js';

/** @typedef {{ tick: number, end: number, midi: number }} MidiNote */
/** @typedef {{ name: string, notes: MidiNote[] }} MidiTrack */

/** @param {ArrayBuffer} buffer */
export function readMidi(buffer) {
  if (buffer.byteLength > 2_000_000) throw new Error('Use a MIDI file smaller than 2 MB.');
  const data = new DataView(buffer);
  let pos = 0;
  let boundary = data.byteLength;
  const check = (/** @type {number} */ count) => {
    if (pos + count > boundary) throw new Error('This MIDI file is incomplete or has an invalid event.');
  };
  const byte = () => { check(1); return data.getUint8(pos++); };
  const u16 = () => { check(2); const n = data.getUint16(pos); pos += 2; return n; };
  const u32 = () => { check(4); const n = data.getUint32(pos); pos += 4; return n; };
  const tag = () => String.fromCharCode(byte(), byte(), byte(), byte());
  const variable = () => {
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const b = byte();
      n = n * 128 + (b & 127);
      if (!(b & 128)) return n;
    }
    throw new Error('This MIDI file contains an invalid variable-length value.');
  };
  if (tag() !== 'MThd') throw new Error('That file is not a Standard MIDI file (.mid or .midi).');
  const headerSize = u32();
  if (headerSize < 6) throw new Error('Invalid MIDI header.');
  check(headerSize);
  const format = u16();
  const trackCount = u16();
  const division = u16();
  if (format > 1) throw new Error('Use a format 0 or format 1 MIDI file.');
  if (!trackCount || !division || division & 0x8000) throw new Error('This MIDI timing format is not supported. Export with ticks per beat (PPQ).');
  pos += headerSize - 6;
  /** @type {MidiTrack[]} */
  const tracks = [];
  let bpm = 72;
  let tempoTick = Infinity;
  let eventCount = 0;
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    boundary = data.byteLength;
    if (tag() !== 'MTrk') throw new Error('Missing MIDI track data.');
    const size = u32();
    check(size);
    boundary = pos + size;
    let tick = 0;
    let runningStatus = 0;
    let name = `Track ${trackIndex + 1}`;
    /** @type {MidiNote[]} */
    const notes = [];
    /** @type {Map<number, MidiNote[]>} */
    const active = new Map();
    while (pos < boundary) {
      if (++eventCount > 100_000) throw new Error('This MIDI file has too many events. Export a shorter section.');
      tick += variable();
      let status = byte();
      if (status < 0x80) {
        if (!runningStatus) throw new Error('Invalid MIDI running status.');
        pos--;
        status = runningStatus;
      } else if (status < 0xf0) runningStatus = status;
      else runningStatus = 0;
      if (status === 0xff) {
        const type = byte();
        const length = variable();
        check(length);
        if (type === 0x03) name = new TextDecoder().decode(new Uint8Array(buffer, pos, length)).replace(/[\x00-\x1f]/g, '').slice(0, 100) || name;
        if (type === 0x51 && length === 3 && tick < tempoTick) {
          const micros = data.getUint8(pos) * 65536 + data.getUint8(pos + 1) * 256 + data.getUint8(pos + 2);
          if (micros) { bpm = Math.round(60_000_000 / micros); tempoTick = tick; }
        }
        pos += length;
        if (type === 0x2f) { pos = boundary; break; }
      } else if (status === 0xf0 || status === 0xf7) {
        const length = variable();
        check(length);
        pos += length;
      } else if (status < 0xf0) {
        const kind = status >> 4;
        const channel = status & 15;
        const first = byte();
        const second = kind === 0xc || kind === 0xd ? 0 : byte();
        if (first > 127 || second > 127) throw new Error('Invalid MIDI channel data.');
        if (channel === 9) continue;
        const key = channel * 128 + first;
        if (kind === 9 && second > 0) {
          const note = { tick, end: tick + division, midi: first };
          notes.push(note);
          const queue = active.get(key) ?? [];
          queue.push(note);
          active.set(key, queue);
        } else if (kind === 8 || (kind === 9 && second === 0)) {
          const note = active.get(key)?.shift();
          if (note) note.end = Math.max(note.tick + 1, tick);
        }
      } else throw new Error('Unsupported MIDI system event.');
    }
    for (const queue of active.values()) for (const note of queue) note.end = Math.max(note.tick + 1, tick);
    if (notes.length) tracks.push({ name, notes: notes.sort((a, b) => a.tick - b.tick || b.midi - a.midi) });
  }
  if (!tracks.length) throw new Error('No playable notes were found. Percussion-only tracks are not piano arrangements.');
  return { tracks, division, bpm: Math.max(30, Math.min(240, bpm)) };
}

/** @param {MidiTrack} track @param {number} division */
export function melodyFromTrack(track, division) {
  /** @type {MidiNote[]} */
  const melody = [];
  let simplified = false;
  for (const note of track.notes) {
    const last = melody.at(-1);
    if (last?.tick === note.tick) { simplified = true; continue; }
    melody.push(note);
  }
  /** @type {import('./core.js').Step[]} */
  const steps = [];
  for (let i = 0; i < melody.length; i++) {
    const n = melody[i];
    if (n.midi < 21 || n.midi > 108) throw new Error('This track has notes outside a piano range (A0-C8). Choose another track.');
    const next = melody[i + 1];
    const end = next ? Math.min(n.end, next.tick) : n.end;
    if (next && n.end > next.tick) simplified = true;
    const beats = Math.max(1 / 64, (end - n.tick) / division);
    if (beats > 64) throw new Error('This track has a note longer than 64 beats. Export a shorter arrangement.');
    steps.push({ midi: n.midi, beats });
    if (next && next.tick > end) {
      const rest = (next.tick - end) / division;
      if (rest > 64) throw new Error('This track has a very long silence. Trim it before importing.');
      if (rest >= 1 / 64) steps.push({ midi: null, beats: rest });
    }
  }
  if (steps.length > MAX_STEPS) throw new Error(`This track has ${steps.length} steps. Export a section of ${MAX_STEPS} or fewer.`);
  return { notes: steps, simplified };
}

/** @param {import('./core.js').Step[]} notes @param {number} bpm */
export function writeMidi(notes, bpm) {
  validateSong({ id: 'export', title: 'Piano draft', notes, bpm, reference: '', description: '', source: 'Cadence' });
  if (!notes.length) throw new Error('Add at least one note before exporting MIDI.');
  /** @param {number} value */
  const variable = (value) => {
    const bytes = [value & 127];
    while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value & 127) | 128);
    return bytes;
  };
  const division = 480;
  const tempo = Math.round(60_000_000 / bpm);
  const track = [0, 0xff, 0x51, 3, tempo >> 16 & 255, tempo >> 8 & 255, tempo & 255, 0, 0xc0, 0];
  let beats = 0;
  let lastTick = 0;
  for (const note of notes) {
    const start = Math.round(beats * division);
    beats += note.beats;
    const end = Math.round(beats * division);
    if (note.midi === null) continue;
    track.push(...variable(start - lastTick), 0x90, note.midi, 88);
    track.push(...variable(end - start), 0x80, note.midi, 0);
    lastTick = end;
  }
  track.push(...variable(Math.round(beats * division) - lastTick), 0xff, 0x2f, 0);
  return Uint8Array.from([
    77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, division >> 8, division & 255,
    77, 84, 114, 107, track.length >>> 24, track.length >>> 16 & 255, track.length >>> 8 & 255, track.length & 255,
    ...track
  ]);
}
