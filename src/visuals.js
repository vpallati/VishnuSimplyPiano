import { NOTE_NAMES, noteName } from './core.js';

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => /** @type {Record<string, string>} */ ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

/** @param {string} name @param {number} [size] */
export function icon(name, size = 20) {
  const paths = /** @type {Record<string, string>} */ ({
    piano: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18m6-18v18M7 3v9h4V3m2 0v9h4V3"/>',
    play: '<path d="m9 5 11 7-11 7z"/>',
    pause: '<path d="M8 5v14m8-14v14" stroke-width="4"/>',
    book: '<path d="M12 6c-3-3-7-3-10-2v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/>',
    chart: '<path d="M4 3v17h17M9 16v-5m5 5V7m5 9V4"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
    headphones: '<path d="M3 15v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
    restart: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    music: '<path d="M9 18V5l12-3v13M9 9l12-3"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="15" rx="3" ry="3"/>',
    cloud: '<path d="M7 18H6a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11h-1m-5 3V11m-4 4 4-4 4 4"/>',
    link: '<path d="m10 14 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)"/>',
    external: '<path d="M14 3h7v7m0-7L10 14m1-11H4v17h17v-7"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v.1"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    loop: '<path d="M4 8h13l-3-3m3 3-3 3M20 16H7l3-3m-3 3 3 3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10"/>'
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.music}</svg>`;
}

/** @param {import('./core.js').Step[]} notes @param {number} active @param {boolean} labels */
export function score(notes, active, labels) {
  const page = Math.floor(Math.max(0, active) / 8) * 8;
  const visible = notes.slice(page, page + 8);
  const lines = [42, 54, 66, 78, 90, 130, 142, 154, 166, 178];
  let content = lines.map((y) => `<path d="M24 ${y}H718" class="staff-line"/>`).join('');
  content += '<path d="M26 42V178M717 42V178" class="staff-bar"/><text x="37" y="84" class="clef">&#119070;</text><text x="39" y="168" class="bass-clef">&#119074;</text>';
  content += visible.map((note, offset) => {
    const x = 133 + offset * 76;
    const isActive = page + offset === active;
    const completed = active === -1 || page + offset < active;
    const className = isActive ? 'score-note current' : completed ? 'score-note passed' : 'score-note';
    let out = isActive ? `<rect x="${x - 27}" y="25" width="54" height="178" rx="13" class="note-highlight"/>` : '';
    if (note.midi === null) return `${out}<g class="${className}"><path d="m${x + 2} 53-6 13 9 9-7 10 4 8" fill="none" stroke="currentColor" stroke-width="4"/><text x="${x}" y="220" class="score-label">rest</text></g>`;
    let midi = note.midi;
    let octave = 0;
    while (midi > 88) { midi -= 12; octave++; }
    while (midi < 40) { midi += 12; octave--; }
    const pitch = NOTE_NAMES[midi % 12];
    const diatonic = (Math.floor(midi / 12) - 1) * 7 + 'CDEFGAB'.indexOf(pitch[0]);
    const treble = midi >= 60;
    const y = treble ? 90 - (diatonic - 30) * 6 : 130 - (diatonic - 26) * 6;
    const top = treble ? 42 : 130;
    const bottom = treble ? 90 : 178;
    out += `<g class="${className}"><title>${noteName(note.midi)}, ${Number(note.beats.toFixed(3))} beats</title>`;
    for (let ly = bottom + 12; ly <= y; ly += 12) out += `<path d="M${x - 14} ${ly}h28" class="ledger"/>`;
    for (let ly = top - 12; ly >= y; ly -= 12) out += `<path d="M${x - 14} ${ly}h28" class="ledger"/>`;
    if (pitch.includes('#')) out += `<text x="${x - 23}" y="${y + 6}" class="accidental">&#9839;</text>`;
    out += `<ellipse cx="${x}" cy="${y}" rx="8.5" ry="6" transform="rotate(-18 ${x} ${y})" fill="${note.beats >= 2 ? 'var(--score-paper)' : 'currentColor'}" stroke="currentColor" stroke-width="2"/>`;
    const up = y >= (top + bottom) / 2;
    const stemX = x + (up ? 7 : -7);
    const stemY = y + (up ? -34 : 34);
    if (note.beats < 4) out += `<path d="M${stemX} ${y}V${stemY}" stroke="currentColor" stroke-width="1.7"/>`;
    if (note.beats < 1) out += `<path d="M${stemX} ${stemY}q${up ? 15 : -15} 10 0 20" fill="none" stroke="currentColor" stroke-width="2"/>`;
    if (note.beats <= 0.25) out += `<path d="M${stemX} ${stemY + (up ? 7 : -7)}q${up ? 15 : -15} 10 0 20" fill="none" stroke="currentColor" stroke-width="2"/>`;
    if ([1.5, 3].includes(note.beats)) out += `<circle cx="${x + 17}" cy="${y - 3}" r="2.5"/>`;
    if (octave) out += `<text x="${x}" y="17" class="octave-mark">${Math.abs(octave) === 1 ? '8' : '15'}${octave > 0 ? 'va' : 'vb'}</text>`;
    if (labels) out += `<text x="${x}" y="220" class="score-label">${noteName(note.midi)}</text>`;
    return `${out}</g>`;
  }).join('');
  return `<svg class="score" viewBox="0 0 744 234" role="img" aria-label="Practice notation, steps ${page + 1} to ${page + visible.length}. ${active >= 0 && notes[active]?.midi !== null ? `Next note ${noteName(/** @type {number} */ (notes[active]?.midi))}.` : 'Phrase complete.'}">${content}</svg>`;
}

export const COMPUTER_KEYS = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'", ']', '\\'];

/** @param {number} base @param {number | null} target @param {boolean} labels @param {number | null} pressed */
export function keyboard(base, target, labels, pressed) {
  const midis = Array.from({ length: 25 }, (_, i) => base + i).filter((midi) => midi >= 21 && midi <= 108);
  const white = midis.filter((midi) => !NOTE_NAMES[midi % 12].includes('#'));
  let whiteBefore = 0;
  return midis.map((midi) => {
    const black = NOTE_NAMES[midi % 12].includes('#');
    const key = COMPUTER_KEYS[midi - base] ?? '';
    const style = black ? `width:${58 / white.length}%;left:${(whiteBefore - 0.29) * 100 / white.length}%` : '';
    if (!black) whiteBefore++;
    return `<button class="piano-key ${black ? 'black' : 'white'}${midi === target ? ' target' : ''}${midi === pressed ? ' pressed' : ''}" data-midi="${midi}" style="${style}" aria-label="Play ${noteName(midi)}${key ? `, computer key ${escapeHtml(key)}` : ''}">${midi === target ? '<span class="key-dot"></span>' : ''}${labels ? `<span class="key-note">${noteName(midi)}</span>` : ''}<span class="key-shortcut">${escapeHtml(key)}</span></button>`;
  }).join('');
}
