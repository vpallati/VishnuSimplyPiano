import test from 'node:test';
import assert from 'node:assert/strict';
import { melodyFromTrack, readMidi } from '../src/midi.js';

const u32 = (n) => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const chunk = (tag, bytes) => [...Buffer.from(tag), ...u32(bytes.length), ...bytes];
const file = (tracks, format = 1, division = 96) => Uint8Array.from([
  ...chunk('MThd', [0, format, 0, tracks.length, division >> 8, division & 255]),
  ...tracks.flatMap((t) => chunk('MTrk', t))
]).buffer;
const end = [0, 0xff, 0x2f, 0];

test('reads track names, tempo, note lengths, rests and running status', () => {
  const bytes = file([[
    0, 0xff, 0x03, 4, ...Buffer.from('Lead'),
    0, 0xff, 0x51, 3, 7, 0xa1, 0x20,
    0, 0x90, 60, 80,
    96, 60, 0,
    48, 62, 90,
    48, 62, 0,
    ...end
  ]]);
  const midi = readMidi(bytes);
  assert.equal(midi.bpm, 120);
  assert.equal(midi.tracks[0].name, 'Lead');
  assert.equal(midi.division, 96);
  assert.deepEqual(melodyFromTrack(midi.tracks[0], 96), {
    notes: [{ midi: 60, beats: 1 }, { midi: null, beats: 0.5 }, { midi: 62, beats: 0.5 }],
    simplified: false
  });
});

test('ignores percussion and preserves melody track choices', () => {
  const midi = readMidi(file([
    [0, 0x99, 36, 80, 96, 0x89, 36, 0, ...end],
    [0, 0x90, 60, 80, 96, 0x80, 60, 0, ...end],
    [0, 0x91, 72, 80, 96, 0x81, 72, 0, ...end]
  ]));
  assert.equal(midi.tracks.length, 2);
  assert.equal(midi.tracks[1].notes[0].midi, 72);
});

test('simultaneous chords choose highest pitch and overlapping notes are trimmed', () => {
  const midi = readMidi(file([[
    0, 0x90, 60, 90, 0, 64, 90, 0, 67, 90,
    48, 69, 90,
    48, 0x80, 60, 0, 0, 64, 0, 0, 67, 0, 0, 69, 0, ...end
  ]]));
  assert.deepEqual(melodyFromTrack(midi.tracks[0], 96), {
    notes: [{ midi: 67, beats: 0.5 }, { midi: 69, beats: 0.5 }],
    simplified: true
  });
});

test('supports format zero and skips system exclusive events', () => {
  const midi = readMidi(file([[0, 0xf0, 3, 1, 2, 0xf7, 0, 0x90, 60, 80, 96, 0x80, 60, 0, ...end]], 0));
  assert.equal(midi.tracks[0].notes[0].end, 96);
});

test('rejects corrupt, truncated, oversized, asynchronous and SMPTE files', () => {
  assert.throws(() => readMidi(new ArrayBuffer(0)), /incomplete/);
  assert.throws(() => readMidi(new ArrayBuffer(2_000_001)), /smaller than/);
  assert.throws(() => readMidi(file([[0, 0x90, 60, 90, ...end]], 2)), /format 0 or format 1/);
  assert.throws(() => readMidi(file([[...end]], 1, 0x8100)), /timing/);
  assert.throws(() => readMidi(file([[0, 60, 90, ...end]])), /running status/);
  assert.throws(() => readMidi(file([[0, 0xff, 3, 127, 65, ...end]])), /incomplete/);
  const valid = file([[0, 0x90, 60, 90, 96, 0x80, 60, 0, ...end]]);
  assert.throws(() => readMidi(valid.slice(0, -1)), /incomplete/);
});

test('oversized arrangements and out-of-range pitches fail explicitly', () => {
  assert.throws(() => melodyFromTrack({ name: '', notes: [{ midi: 12, tick: 0, end: 96 }] }, 96), /outside/);
  assert.throws(() => melodyFromTrack({ name: '', notes: Array.from({ length: 513 }, (_, i) => ({ midi: 60, tick: i * 96, end: (i + 1) * 96 })) }, 96), /513 steps/);
});
