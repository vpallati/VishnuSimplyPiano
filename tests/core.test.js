import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, formatNotes, frequencyForNote, NoteGate, noteForFrequency, noteName, parseNotes, Practice, referenceUrl, validateSong } from '../src/core.js';
import { BUILTIN_SONGS } from '../src/songs.js';

test('notes parse sharps, flats, octaves, rests and beat lengths', () => {
  const notes = parseNotes('C4 D#4:0.5 Eb4 Bb3:2 R:1 A0 C8');
  assert.deepEqual(notes.map((n) => n.midi), [60, 63, 63, 58, null, 21, 108]);
  assert.equal(notes[1].beats, 0.5);
  assert.deepEqual(parseNotes(formatNotes(notes)), notes);
  assert.equal(noteName(60), 'C4');
  assert.equal(noteForFrequency(440).midi, 69);
});

test('note input rejects malformed notes, out-of-range piano pitches and unsafe durations', () => {
  for (const notes of ['C', 'H4', 'C9', 'C0', 'C4:0', 'C4:0.001', 'C4:65', 'C4:-1', '<script>', Array(513).fill('C4').join(' ')]) {
    assert.throws(() => parseNotes(notes));
  }
  assert.throws(() => validateSong({ ...BUILTIN_SONGS[0], notes: parseNotes('R R:2') }), /at least one/);
  assert.throws(() => validateSong({ ...BUILTIN_SONGS[0], bpm: NaN }), /Tempo/);
});

test('references accept video URLs and reject unsafe or non-video links', () => {
  const expected = 'https://www.youtube.com/watch?v=iUrjWDnyFCM';
  assert.equal(referenceUrl('https://youtu.be/iUrjWDnyFCM?t=3'), expected);
  assert.equal(referenceUrl('https://www.youtube.com/shorts/iUrjWDnyFCM'), expected);
  assert.equal(referenceUrl(''), '');
  for (const url of ['javascript:alert(1)', 'http://youtu.be/iUrjWDnyFCM', 'https://youtube.com.evil.example/watch?v=iUrjWDnyFCM', 'https://www.youtube.com/playlist?list=test']) {
    assert.throws(() => referenceUrl(url));
  }
});

test('practice waits for the exact pitch and octave, skips rests, and completes once', () => {
  const practice = new Practice(parseNotes('R C4 D4 R:2 E4 R'));
  assert.equal(practice.index, 1);
  assert.equal(practice.play(72).correct, false);
  assert.equal(practice.index, 1);
  assert.equal(practice.play(60).correct, true);
  assert.equal(practice.index, 2);
  practice.play(62);
  assert.equal(practice.index, 4);
  assert.equal(practice.play(64).completed, true);
  assert.equal(practice.finished, true);
  assert.equal(practice.play(64).ignored, true);
  practice.restart();
  assert.equal(practice.index, 1);
});

test('loops stay within selected steps and do not award full completions', () => {
  const practice = new Practice(parseNotes('C4 R D4 E4'));
  practice.setLoop(1, 2, true);
  assert.equal(practice.index, 2);
  const result = practice.play(62);
  assert.equal(result.completed, false);
  assert.equal(practice.index, 2);
  assert.equal(practice.finished, false);
  for (const range of [[-1, 2], [2, 1], [0, 4], [1, 1], [0.5, 2]]) assert.throws(() => practice.setLoop(...range, true));
  practice.setLoop(0, 3, false);
  assert.equal(practice.index, 0);
});

test('empty reference songs cannot accept practice notes', () => {
  const practice = new Practice([]);
  assert.equal(practice.finished, true);
  assert.equal(practice.play(60).ignored, true);
});

test('pitch detector finds piano-range synthetic fundamentals at 44.1 and 48 kHz', () => {
  for (const sampleRate of [44100, 48000]) {
    for (const midi of [33, 45, 48, 60, 61, 69, 72, 81, 88]) {
      const frequency = frequencyForNote(midi);
      const samples = Float32Array.from({ length: 2048 }, (_, i) => {
        const phase = 2 * Math.PI * frequency * i / sampleRate;
        return 0.18 * Math.sin(phase) + 0.07 * Math.sin(2 * phase) + 0.025 * Math.sin(3 * phase);
      });
      const result = detectPitch(samples, sampleRate);
      assert.ok(result, `pitch found for ${noteName(midi)} at ${sampleRate}`);
      assert.equal(noteForFrequency(result.frequency).midi, midi);
      assert.ok(Math.abs(noteForFrequency(result.frequency).cents) <= 8, `${midi}: ${result.frequency}`);
      assert.ok(result.confidence > 0.86);
    }
  }
});

test('pitch detector ignores silence, quiet noise and broadband noise', () => {
  assert.equal(detectPitch(new Float32Array(2048), 48000), null);
  assert.equal(detectPitch(new Float32Array(2048).fill(0.001), 48000), null);
  let seed = 51;
  const noise = Float32Array.from({ length: 2048 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 2 ** 32 - 0.5) * 0.3;
  });
  assert.equal(detectPitch(noise, 48000), null);
});

test('note gate requires stability, rejects sustained repeats and rearms after release', () => {
  const gate = new NoteGate();
  assert.equal(gate.update(60, 0), null);
  assert.equal(gate.update(60, 65), null);
  assert.equal(gate.update(60, 130), 60);
  assert.equal(gate.update(60, 195), null);
  assert.equal(gate.update(60, 260), null);
  gate.update(null, 325);
  gate.update(null, 455);
  assert.equal(gate.update(60, 520), null);
  assert.equal(gate.update(60, 650), 60);
  assert.equal(gate.update(62, 715), null);
  assert.equal(gate.update(62, 845), 62);
});

test('all included arrangements are valid and playable to completion', () => {
  for (const song of BUILTIN_SONGS) {
    validateSong(song);
    const practice = new Practice(song.notes);
    let completed = 0;
    for (const note of song.notes) if (note.midi !== null) completed += Number(practice.play(note.midi).completed);
    assert.equal(completed, 1);
    assert.equal(practice.finished, true);
  }
});
