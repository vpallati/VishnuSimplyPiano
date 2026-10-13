import { validateSong } from './core.js';
import { BUILTIN_SONGS, EXAMPLE_REFERENCE } from './songs.js';

export const STORAGE_KEY = 'cadence.piano.v1';
/** @typedef {{ version: 1, songs: import('./core.js').Song[], progress: Record<string, import('./core.js').Progress>, selected: string }} SavedData */

/** @returns {SavedData} */
export function freshData() {
  return { version: 1, songs: [structuredClone(EXAMPLE_REFERENCE)], progress: {}, selected: 'first-light' };
}

/** @param {unknown} value @returns {SavedData} */
export function validateData(value) {
  if (!value || typeof value !== 'object') throw new Error('This is not a Cadence backup.');
  const data = /** @type {Record<string, unknown>} */ (value);
  if (data.version !== 1 || !Array.isArray(data.songs) || data.songs.length > 100) throw new Error('Unsupported backup format or too many songs (maximum 100).');
  const songs = data.songs.map(validateSong);
  const ids = new Set(BUILTIN_SONGS.map((s) => s.id));
  for (const song of songs) {
    if (ids.has(song.id) || ['__proto__', 'constructor', 'prototype'].includes(song.id)) throw new Error('The backup contains duplicate or reserved song IDs.');
    ids.add(song.id);
  }
  if (!data.progress || typeof data.progress !== 'object' || Array.isArray(data.progress)) throw new Error('Invalid practice history.');
  /** @type {Record<string, import('./core.js').Progress>} */
  const progress = {};
  for (const [id, raw] of Object.entries(data.progress)) {
    if (!ids.has(id) || !raw || typeof raw !== 'object') throw new Error('Practice history refers to an unknown song.');
    const p = /** @type {Record<string, unknown>} */ (raw);
    for (const key of ['correct', 'attempts', 'completed', 'furthest', 'seconds']) {
      if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < 0 || p[key] > 1e12) throw new Error('Invalid practice statistics.');
    }
    if (typeof p.lastPlayed !== 'string' || (p.lastPlayed !== '' && !Number.isFinite(Date.parse(p.lastPlayed)))) throw new Error('Invalid practice date.');
    progress[id] = { correct: Number(p.correct), attempts: Number(p.attempts), completed: Number(p.completed), furthest: Number(p.furthest), seconds: Number(p.seconds), lastPlayed: p.lastPlayed };
  }
  const selected = typeof data.selected === 'string' && ids.has(data.selected) ? data.selected : BUILTIN_SONGS[0].id;
  return { version: 1, songs, progress, selected };
}

/** @param {Storage} storage */
export function loadData(storage) {
  const saved = storage.getItem(STORAGE_KEY);
  return saved === null ? freshData() : validateData(JSON.parse(saved));
}

/** @param {Storage} storage @param {SavedData} data */
export function saveData(storage, data) {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}
