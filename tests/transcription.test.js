import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotes } from '../src/core.js';
import { readMidi, writeMidi, melodyFromTrack } from '../src/midi.js';
import { draftFromDetection, monoSection, TRANSCRIPTION_RATE, validateAudioSection } from '../src/transcription.js';

const note = (midi, start, duration, amplitude = 0.8) => ({
  pitchMidi: midi, startTimeSeconds: start, durationSeconds: duration, amplitude
});

test('audio sections enforce exact file, clip, and tempo bounds', () => {
  for (const args of [[0, 0.5, 0.5, 30], [100, 160, 600, 240], [0, 60, 60, 72]]) {
    assert.doesNotThrow(() => validateAudioSection(...args));
  }
  for (const args of [[0, 0.49, 2, 72], [0, 60.001, 100, 72], [-1, 2, 20, 72], [2, 1, 20, 72], [0, 11, 10, 72], [0, 2, 600.001, 72], [0, 2, 10, 29], [0, 2, 10, 241], [NaN, 2, 10, 72]]) {
    assert.throws(() => validateAudioSection(...args));
  }
});

test('mono extraction averages channels and selects the exact audio section', () => {
  const left = new Float32Array(TRANSCRIPTION_RATE * 2).fill(0.25);
  const right = new Float32Array(TRANSCRIPTION_RATE * 2).fill(0.75);
  const buffer = { duration: 2, sampleRate: TRANSCRIPTION_RATE, numberOfChannels: 2, length: left.length, getChannelData: (channel) => channel ? right : left };
  const samples = monoSection(buffer, 0.5, 1.5);
  assert.equal(samples.length, TRANSCRIPTION_RATE);
  assert.ok(samples.every((sample) => sample === 0.5));
  assert.throws(() => monoSection({ ...buffer, sampleRate: 48000 }, 0, 1), /22050/);
  assert.throws(() => monoSection({ ...buffer, getChannelData: () => new Float32Array(left.length) }, 0, 1), /silent/);
});

test('single-note detections preserve pitches, repeated strikes, rests and timing', () => {
  const result = draftFromDetection([note(60, 0.2, 0.5), note(60, 0.7, 0.5), note(62, 1.5, 1)], 3, 60);
  assert.deepEqual(result.notes, [
    { midi: 60, beats: 0.5 }, { midi: 60, beats: 0.5 }, { midi: null, beats: 0.3 }, { midi: 62, beats: 1 }
  ]);
  assert.equal(result.overlaps, false);
  assert.equal(result.filtered, 0);
});

test('polyphonic input chooses highest active pitch rather than claiming instrument separation', () => {
  const result = draftFromDetection([note(48, 0, 2), note(60, 0.5, 1), note(67, 1, 0.25)], 2, 60);
  assert.equal(result.overlaps, true);
  assert.deepEqual(result.notes.filter((n) => n.midi !== null).map((n) => n.midi), [48, 60, 67, 60, 48]);
});

test('weak, tiny and outside-range detections are counted and filtered', () => {
  const result = draftFromDetection([note(60, 0, 0.5), note(62, 1, 0.05), note(64, 1, 0.5, 0.1), note(36, 2, 0.5)], 3, 72, true);
  assert.equal(result.filtered, 3);
  assert.equal(result.notes.length, 1);
  assert.throws(() => draftFromDetection([], 3, 72), /No clear/);
  assert.throws(() => draftFromDetection([note(60.5, 0, 1)], 3, 72), /invalid note/);
  assert.throws(() => draftFromDetection([note(60, 0, NaN)], 3, 72), /invalid note/);
  assert.throws(() => draftFromDetection([note(60, 0, 60)], 60, 240), /longer than 64/);
});

test('MIDI export round-trips pitch, rests, fractional durations and tempo', () => {
  const notes = parseNotes('C4:0.5 R:0.25 F#4:1.5 Bb3:2 C8:0.015625');
  const bytes = writeMidi(notes, 93);
  assert.deepEqual([...bytes.slice(0, 4)], [77, 84, 104, 100]);
  const midi = readMidi(bytes.buffer);
  assert.equal(midi.bpm, 93);
  const restored = melodyFromTrack(midi.tracks[0], midi.division).notes;
  assert.equal(restored.length, notes.length);
  for (let i = 0; i < notes.length; i++) {
    assert.equal(restored[i].midi, notes[i].midi);
    assert.ok(Math.abs(restored[i].beats - notes[i].beats) <= 1 / midi.division);
  }
});

test('export encodes leading silence and never accepts invalid notes or tempos', () => {
  const midi = readMidi(writeMidi(parseNotes('R:2 C4:2 R:1'), 72).buffer);
  assert.equal(midi.tracks[0].notes[0].tick, 960);
  assert.equal(midi.tracks[0].notes[0].end, 1920);
  assert.throws(() => writeMidi([], 72), /at least one/);
  assert.throws(() => writeMidi(parseNotes('R:2'), 72), /at least one/);
  assert.throws(() => writeMidi(parseNotes('C4'), 0), /Tempo/);
  assert.throws(() => writeMidi([{ midi: 200, beats: 1 }], 72), /invalid note/);
});
