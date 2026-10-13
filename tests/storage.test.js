import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress } from '../src/core.js';
import { freshData, loadData, saveData, STORAGE_KEY, validateData } from '../src/storage.js';

test('fresh libraries include the real reference but no invented arrangement', () => {
  const data = freshData();
  assert.equal(data.songs[0].title, 'Yogeshwaraya Mahadevaya');
  assert.equal(data.songs[0].notes.length, 0);
  assert.match(data.songs[0].reference, /iUrjWDnyFCM/);
  assert.deepEqual(validateData(data), data);
});

test('songs and practice progress survive a local storage round trip', () => {
  const values = new Map();
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const data = loadData(storage);
  data.progress['first-light'] = { ...emptyProgress(), correct: 8, attempts: 9, furthest: 8, lastPlayed: '2026-10-12T12:00:00.000Z' };
  saveData(storage, data);
  assert.deepEqual(loadData(storage), data);
  assert.ok(values.has(STORAGE_KEY));
});

test('invalid backups reject bad statistics, duplicates and unknown references', () => {
  const sample = freshData();
  assert.throws(() => validateData({ ...sample, version: 2 }), /Unsupported/);
  assert.throws(() => validateData({ ...sample, songs: [sample.songs[0], sample.songs[0]] }), /duplicate/);
  assert.throws(() => validateData({ ...sample, songs: [{ ...sample.songs[0], id: '__proto__' }] }), /reserved/);
  assert.throws(() => validateData({ ...sample, progress: { 'first-light': { ...emptyProgress(), seconds: -1 } } }), /statistics/);
  assert.throws(() => validateData({ ...sample, progress: { missing: emptyProgress() } }), /unknown/);
  assert.throws(() => validateData({ ...sample, progress: { 'first-light': { ...emptyProgress(), lastPlayed: 'not a date' } } }), /date/);
});

test('unavailable or corrupt storage is surfaced, not overwritten', () => {
  const unavailable = { getItem() { throw new Error('Access denied'); }, setItem() { throw new Error('Quota exceeded'); } };
  assert.throws(() => loadData(unavailable), /Access denied/);
  assert.throws(() => saveData(unavailable, freshData()), /Quota exceeded/);
  let writes = 0;
  const corrupt = { getItem: () => '{bad json', setItem: () => { writes++; } };
  assert.throws(() => loadData(corrupt));
  assert.equal(writes, 0);
});
