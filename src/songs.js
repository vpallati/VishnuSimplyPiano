import { parseNotes } from './core.js';

/** @type {import('./core.js').Song[]} */
export const BUILTIN_SONGS = [
  {
    id: 'first-light',
    title: 'First Light',
    description: 'A gentle first melody. Find middle C and take it one note at a time.',
    bpm: 72,
    notes: parseNotes('C4 D4 E4 G4:2 E4 D4 C4:2 E4 G4 A4 G4:2 E4 D4 C4:2'),
    reference: '',
    source: 'Cadence original'
  },
  {
    id: 'little-steps',
    title: 'Little Steps',
    description: 'Get to know five neighboring keys, then find your way back home.',
    bpm: 64,
    notes: parseNotes('C4 D4 E4 F4 G4:2 G4 F4 E4 D4 C4:2 C4 E4 G4 E4 C4:2'),
    reference: '',
    source: 'Cadence original'
  },
  {
    id: 'after-rain',
    title: 'After the Rain',
    description: 'A quiet melody in A minor, with a little more room to explore.',
    bpm: 68,
    notes: parseNotes('A3:2 C4 E4:2 D4 C4 B3 A3:2 R:1 E4 G4 A4:2 G4 E4 D4 C4:2 B3 A3:2'),
    reference: '',
    source: 'Cadence original'
  }
];

/** @type {import('./core.js').Song} */
export const EXAMPLE_REFERENCE = {
  id: 'yogeshwaraya-reference',
  title: 'Yogeshwaraya Mahadevaya',
  description: 'Learn with Aditya Lankoti\'s piano tutorial. For microphone-guided practice, add a MIDI arrangement or enter notes.',
  bpm: 72,
  notes: [],
  reference: 'https://www.youtube.com/watch?v=iUrjWDnyFCM',
  tutorial: 'https://www.youtube.com/watch?v=hPUseuixiTM',
  source: 'YouTube reference'
};
