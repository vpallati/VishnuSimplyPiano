import { emptyProgress, formatNotes, noteName, parseNotes, Practice, validateSong } from './core.js';
import { BUILTIN_SONGS } from './songs.js';
import { freshData, loadData, saveData, validateData } from './storage.js';
import { melodyFromTrack, readMidi } from './midi.js';
import { Microphone, PianoAudio } from './audio.js';
import { COMPUTER_KEYS, escapeHtml as esc, icon, keyboard, score } from './visuals.js';
import { defaultLessonMode, newVideoSession, VideoLesson, videoMarkup, videoUrl } from './video.js';

/** @template {HTMLElement} T @param {string} selector @returns {T} */
function $(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return /** @type {T} */ (element);
}

let data = freshData();
let storageError = '';
let canSave = true;
try { data = loadData(localStorage); }
catch (error) {
  canSave = false;
  storageError = `Your saved data could not be loaded. It has not been overwritten. ${message(error)} You can still practice and export a backup.`;
}
let view = 'practice';
let song = findSong(data.selected);
let lessonMode = defaultLessonMode(song);
/** @type {VideoLesson | null} */
let videoLesson = null;
/** @type {Map<string, import('./video.js').VideoSession>} */
const videoSessions = new Map();
let practice = new Practice(song.notes);
let tempo = song.bpm;
let labels = true;
let base = 60;
let heard = '';
let feedback = 'Your piano. Your pace. We wait for every note.';
let feedbackKind = '';
let pressed = /** @type {number | null} */ (null);
let demoIndex = -1;
let demoTimer = 0;
let demoGeneration = 0;
let demo = false;
let micPending = false;
let micRequest = 0;
let manualUntil = 0;
let editingId = '';
let search = '';
let noticeTimer = 0;
let pressedTimer = 0;
let midiData = /** @type {ReturnType<typeof readMidi> | null} */ (null);
const piano = new PianoAudio();
const mic = new Microphone(
  (midi) => playNote(midi, 'mic'),
  (pitch, level) => {
    if (view !== 'practice' || !document.querySelector('#input-meter')) return;
    $('#input-meter').style.setProperty('--level', `${level * 100}%`);
    $('#heard').textContent = pitch ? `${noteName(pitch.midi)} ${pitch.cents > 0 ? '+' : ''}${pitch.cents} cents` : 'Listening for a note';
  },
  (error) => { micPending = false; notice(error, true); updateInput(); }
);

/** @param {unknown} error */
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
function allSongs() { return [...BUILTIN_SONGS, ...data.songs]; }
/** @param {string} id */
function findSong(id) { return allSongs().find((item) => item.id === id) ?? BUILTIN_SONGS[0]; }
/** @param {string} [id] */
function progress(id = song.id) { return data.progress[id] ?? emptyProgress(); }
function isBuiltin() { return BUILTIN_SONGS.some((item) => item.id === song.id); }
function persist() {
  if (!canSave) return;
  try { saveData(localStorage, data); }
  catch (error) {
    canSave = false;
    storageError = `Progress is only in memory: ${message(error)}. Export a backup before leaving this page.`;
    $('#storage-warning').textContent = storageError;
    $('#storage-warning').hidden = false;
    $('#save-state').textContent = 'Session only - export a backup';
  }
}
/** @param {string} text @param {boolean} [error] */
function notice(text, error = false) {
  const box = $('#notice');
  box.textContent = text;
  box.className = `notice${error ? ' error' : ''}`;
  box.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { box.hidden = true; }, error ? 12000 : 5000);
}

$('#app').innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="#practice" aria-label="Cadence home"><span class="brand-mark">${icon('piano', 25)}</span><span>cadence<span class="brand-dot">.</span></span></a>
    <div class="sidebar-caption">YOUR PIANO, YOUR PACE</div>
    <nav class="navigation" aria-label="Main navigation">
      <button data-view="practice">${icon('piano')}<span>Practice studio</span><span class="nav-dot"></span></button>
      <button data-view="library">${icon('book')}<span>My song library</span><span class="nav-count" id="library-count"></span></button>
      <button data-view="progress">${icon('chart')}<span>My progress</span></button>
    </nav>
    <div class="sidebar-bottom">
      <div class="sidebar-note"><span class="little-spark">${icon('spark', 24)}</span><h3>A little, every day.</h3><p>Five quiet minutes can be the start of something beautiful.</p><div class="tiny-keyboard"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="local-note">${icon('shield', 17)}<span>Free. Private. Yours.</span></div>
      <button class="text-button sidebar-help" data-action="help">${icon('help', 17)} How Cadence works</button>
    </div>
  </aside>
  <main>
    <header class="topbar"><span class="breadcrumb">Your personal piano space</span><div class="topbar-right"><span class="local-pill"><span></span><span id="save-state">${canSave ? 'Saved on this device' : 'Session only - export a backup'}</span></span><button class="icon-button" data-action="help" aria-label="Help">${icon('help')}</button><span class="avatar" aria-label="Your local profile">You</span></div></header>
    <div class="main-content">
      <div id="storage-warning" class="storage-warning" role="alert" ${storageError ? '' : 'hidden'}>${esc(storageError)}</div>
      <section class="page-heading"><div><div class="eyebrow" id="heading-eyebrow">A LITTLE PRACTICE, A LITTLE PROGRESS</div><h1 id="heading-title">Your next note starts here.</h1><p id="heading-description">Make time for the music you love. We'll take it one note at a time.</p></div><button class="button dark-button" data-action="add">${icon('plus', 18)} Add a song</button></section>
      <div id="page-content"></div>
      <footer><span>Made for the joy of learning.</span><span>No subscriptions. No uploads. Just music. ${icon('music', 14)}</span></footer>
    </div>
  </main>
  <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
  <dialog id="editor" class="modal" aria-labelledby="editor-title">
    <form id="song-form">
      <div class="modal-heading"><div><div class="eyebrow">MAKE IT YOURS</div><h2 id="editor-title">Add your next favorite.</h2></div><button type="button" class="icon-button" data-action="close-editor" aria-label="Close song editor">${icon('close')}</button></div>
      <p class="muted">Bring a melody, not a subscription. Start with notes or save a reference for later.</p>
      <div id="editor-error" class="form-error" role="alert" hidden></div>
      <label class="field-label" for="song-title">Song title</label><input id="song-title" name="title" maxlength="100" required placeholder="A song you've always wanted to play" />
      <div class="form-row"><div><label class="field-label" for="song-bpm">Playback tempo (BPM)</label><input id="song-bpm" name="bpm" type="number" min="30" max="240" value="72" required /></div><div class="import-field"><button type="button" class="button secondary" data-action="midi">${icon('cloud', 18)} Import MIDI</button><span class="field-hint">.mid or .midi, up to 2 MB</span></div></div>
      <div id="track-field" hidden><label class="field-label" for="midi-track">Choose the melody track</label><select id="midi-track"></select><p id="midi-info" class="field-hint"></p></div>
      <label class="field-label" for="song-notes">Piano notes <span class="optional">optional for references</span></label>
      <textarea id="song-notes" rows="4" placeholder="C4 D4 E4 G4:2 E4 D4 C4:2" spellcheck="false" aria-describedby="notes-help"></textarea>
      <p id="notes-help" class="field-hint">Middle C is C4. Use F#4 or Bb3 for black keys, C4:2 for two beats, R:1 for a rest. Separate notes with spaces. Up to 512 steps.</p>
      <label class="field-label" for="song-reference">YouTube reference <span class="optional">optional</span></label><input id="song-reference" type="url" placeholder="https://www.youtube.com/watch?v=..." />
      <label class="field-label" for="song-tutorial">Piano tutorial video <span class="optional">optional</span></label><input id="song-tutorial" type="url" placeholder="https://www.youtube.com/watch?v=..." />
      <div class="editor-note">${icon('link', 18)}<span>Video mode uses your tutorial, or the reference if no tutorial is added. Guided notes still need an arrangement. Videos aren't automatically transcribed. Only import arrangements you have permission to use.</span></div>
      <div class="modal-actions"><button type="button" class="text-button" data-action="close-editor">Cancel</button><button type="submit" class="button primary">${icon('check', 18)} Save song</button></div>
    </form>
  </dialog>
  <dialog id="help" class="modal help-modal" aria-labelledby="help-title">
    <div class="modal-heading"><div><div class="eyebrow">WELCOME TO CADENCE</div><h2 id="help-title">A small guide to getting started.</h2></div><button class="icon-button" data-action="close-help" aria-label="Close help">${icon('close')}</button></div>
    <div class="help-step"><span>01</span><div><h3>Find your next note</h3><p>The green note and piano key show what to play. C4 is middle C. Note names are always available; the two staves represent higher and lower notes.</p></div></div>
    <div class="help-step"><span>02</span><div><h3>Let your piano do the talking</h3><p>Enable your microphone and allow access. Play one note clearly, close to the microphone, without the sustain pedal. Cadence waits until it hears the right pitch. Release repeated notes between strikes.</p></div></div>
    <div class="help-step"><span>03</span><div><h3>Small sections, as often as you like</h3><p>Listen to the demo, adjust its tempo, or loop a few steps. Practice is pitch-based, not a rhythm or fingering assessment. Rests play in the demo and are skipped in wait-for-note practice.</p></div></div>
    <div class="help-step"><span>04</span><div><h3>Make space for your songs</h3><p>Add a YouTube reference, enter notes, or import a MIDI file you can use. Choose its melody track; simultaneous chords become the highest note and overlapping notes are shortened. It is a practice simplification, not an automatic arrangement.</p></div></div>
    <div class="help-step"><span>05</span><div><h3>Choose how you learn</h3><p>Switch between Video lesson and Guided notes on the music stand. Load a video only when you want to connect to YouTube. Slow it down with the available speeds, mark the start and end in seconds, and enable a section loop. Video playback never listens to your microphone or earns pitch scores. Guided mode needs piano notes for the selected song.</p></div></div>
    <div class="help-callout"><strong>A note about listening</strong><p>Microphone detection is experimental and monophonic, roughly A1-A6; middle-register notes work best. Background music, chords, headphones with processing, and sustain can confuse it. Use a quiet room and Chrome or Edge over HTTPS. All microphone processing stays on this device.</p><p>No piano nearby? Click the keys or use the letters shown below them. During demo playback, input and progress tracking pause.</p></div>
    <p class="muted">Progress is saved to this browser, not an account. Clearing site data removes it. Export a backup from My progress. This app isn't affiliated with Simply Piano or the linked artists.</p>
    <button class="button primary full-width" data-action="close-help">Let's make some music ${icon('arrow', 18)}</button>
  </dialog>
  <input type="file" id="midi-file" accept=".mid,.midi,audio/midi,audio/x-midi" hidden />
  <input type="file" id="backup-file" accept=".json,application/json" hidden />
`;

function render() {
  videoLesson?.destroy();
  videoLesson = null;
  document.querySelectorAll('[data-view]').forEach((el) => {
    const active = /** @type {HTMLElement} */ (el).dataset.view === view;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  $('#library-count').textContent = String(allSongs().length);
  const headings = /** @type {Record<string, [string, string, string]>} */ ({
    practice: ['A LITTLE PRACTICE, A LITTLE PROGRESS', 'Your next note starts here.', "Make time for the music you love. We'll take it one note at a time."],
    library: ['A COLLECTION THAT SOUNDS LIKE YOU', 'Your music. Your motivation.', 'A few first melodies, and all the songs you want to grow into.'],
    progress: ['EVERY NOTE IS A STEP FORWARD', 'Look how far you\'ve come.', 'Small moments add up. Your practice history lives right here, on this device.']
  });
  $('#heading-eyebrow').textContent = headings[view][0];
  $('#heading-title').textContent = headings[view][1];
  $('#heading-description').textContent = headings[view][2];
  if (view === 'practice') renderPractice();
  else if (view === 'library') renderLibrary();
  else renderProgress();
}

function renderPractice() {
  const hasNotes = song.notes.length > 0;
  $('#page-content').innerHTML = `
    <div class="practice-layout">
      <div class="studio-column">
        <section class="studio-card">
          <div class="studio-heading"><div class="song-heading-icon">${icon('music', 23)}</div><div class="song-heading-copy"><div class="eyebrow">ON THE MUSIC STAND</div><h2>${esc(song.title)}</h2><div class="song-meta">${hasNotes ? '<span class="badge mint">Guided notes ready</span><span>' + song.notes.filter((n) => n.midi !== null).length + ' notes</span>' : '<span class="badge amber">Guided notes need an arrangement</span>'}${videoUrl(song) ? '<span class="badge mint">Video linked</span>' : ''}<span>${esc(song.source)}</span></div></div><button class="icon-button" data-action="edit" aria-label="${isBuiltin() ? 'Make an editable copy' : 'Edit this song'}">${icon('edit', 18)}</button></div>
          <div class="lesson-switch" role="group" aria-label="Lesson mode"><button data-lesson-mode="video" aria-pressed="${lessonMode === 'video'}">${icon('play', 17)}<span>Video lesson<small>Watch, slow down, repeat</small></span></button><button data-lesson-mode="guided" aria-pressed="${lessonMode === 'guided'}">${icon('piano', 18)}<span>Guided notes<small>Wait for the correct note</small></span></button></div>
          ${lessonMode === 'video' ? videoMarkup(song) : hasNotes ? `
          <div class="score-toolbar"><span class="waiting-tag"><span></span> <span id="practice-mode">Wait-for-note mode</span></span><label class="toggle-label"><input id="show-labels" type="checkbox" ${labels ? 'checked' : ''} /> Note names</label></div>
          <div id="score-container" class="score-container"></div>
          <div class="phrase-progress"><div class="progress-track"><div id="phrase-fill"></div></div><span id="phrase-count"></span></div>
          <div id="next-note-panel" class="next-note-panel"><div class="next-note-main"><div class="target-symbol" id="target-symbol">C<span>4</span></div><div><div class="eyebrow" id="target-caption">YOUR NEXT NOTE</div><div class="target-description" id="target-description">Find middle C</div></div></div><button class="button hear-button" data-action="hear">${icon('headphones', 17)} Hear note</button></div>
          <div class="keyboard-wrap"><div id="piano-keyboard" class="piano-keyboard" role="group" aria-label="Interactive piano"></div></div>
          <div class="keyboard-caption"><span>${icon('keyboard', 15)} Play your piano, click a key, or use your computer keyboard</span><span class="target-legend"><i></i> Your next note</span></div>
          <div id="feedback" class="feedback" role="status" aria-live="polite"></div>
          <div class="transport"><button class="button primary mic-button" data-action="mic" id="mic-button">${icon('mic', 18)} Enable microphone</button><button class="button secondary" data-action="demo" id="demo-button">${icon('play', 17)} Listen to demo</button><button class="icon-button restart-button" data-action="restart" aria-label="Restart this practice">${icon('restart', 19)}</button></div>
          <div class="input-status"><span class="input-dot" id="input-dot"></span><span id="input-label">Microphone off</span><span class="input-meter" id="input-meter"><i></i></span><span class="heard" id="heard">Audio stays on your device</span></div>
          ` : `
          <div class="arrangement-empty"><div class="empty-icon">${icon('music', 42)}</div><span class="badge amber">GUIDED NOTES ARE NOT READY YET</span><h3>To wait for your notes,<br>we need the arrangement.</h3><p>The video does not supply a reliable note sequence. Import a MIDI melody or enter notes you have permission to use. We will never fill this song with a different melody.</p><button class="button primary" data-action="edit">${icon('plus', 18)} Add an arrangement</button>${videoUrl(song) ? `<button class="reference-link text-button" data-lesson-mode="video">Learn this song with the video ${icon('arrow', 16)}</button>` : ''}<p class="arrangement-hint">Once notes are added, you can switch between both modes for this same song.</p></div>
          `}
        </section>
        ${hasNotes && lessonMode === 'guided' ? `<section class="practice-settings"><div class="tempo-setting"><div class="setting-title">${icon('clock', 18)}<label for="tempo">Playback tempo</label><strong id="tempo-value">${tempo} <small>BPM</small></strong></div><div class="range-row"><span>Slower</span><input id="tempo" type="range" min="30" max="240" value="${tempo}" /><span>Faster</span></div><p>Demo speed changes. Practice always waits for you.</p></div><div class="loop-setting"><div class="setting-title">${icon('loop', 19)}<label for="loop-enabled">Loop a section</label><input id="loop-enabled" type="checkbox" ${practice.loop ? 'checked' : ''} /></div><div class="loop-fields"><label for="loop-start">From step</label><input id="loop-start" type="number" min="1" max="${song.notes.length}" value="${practice.start + 1}" /><span>to</span><input id="loop-end" aria-label="Loop end step" type="number" min="1" max="${song.notes.length}" value="${practice.end + 1}" /></div><p>Repeat the tricky parts. There's no rush.</p><p class="form-error" id="loop-error" role="alert" hidden></p></div></section>` : ''}
      </div>
      <aside class="practice-aside">
        <section class="library-preview"><div class="section-heading"><h3>Up on your stand</h3><button class="text-button" data-view="library" aria-label="View song library">${icon('arrow', 18)}</button></div><p class="section-subtitle">A melody for every little moment.</p><div class="song-list">${allSongs().slice(0, 5).map(songRow).join('')}</div><button class="add-song-button" data-action="add">${icon('plus', 17)} Make room for your music</button></section>
        <section class="tip-card"><div class="eyebrow">${icon('sun', 18)} A FRIENDLY REMINDER</div><h3>Slow is a lovely<br>place to start.</h3><p>Let each note ring. Lift your hand. Find the next one. The speed will come.</p><div class="tip-line"></div><span>Progress, not perfection.</span></section>
        <section class="session-card"><div class="session-icon">${icon('chart', 22)}</div><div><strong id="today-correct">${progress().correct}</strong><span>notes practiced in this song</span></div></section>
        ${song.reference ? `<a class="reference-card" href="${esc(song.reference)}" target="_blank" rel="noopener noreferrer">${icon('external', 18)}<span>Open song reference<small>Opens YouTube in another tab</small></span></a>` : ''}
      </aside>
    </div>`;
  if (lessonMode === 'video' && videoUrl(song)) {
    const key = `${song.id}:${videoUrl(song)}`;
    const session = videoSessions.get(key) ?? newVideoSession();
    videoSessions.set(key, session);
    videoLesson = new VideoLesson($('#video-lesson'), videoUrl(song), session);
  } else if (hasNotes && lessonMode === 'guided') { renderStage(); updateInput(); }
}

/** @param {import('./core.js').Song} item */
function songRow(item) {
  const original = BUILTIN_SONGS.some((built) => built.id === item.id);
  return `<button class="song-row${item.id === song.id ? ' selected' : ''}" data-song="${esc(item.id)}"><span class="song-art ${original ? `art-${BUILTIN_SONGS.findIndex((s) => s.id === item.id)}` : 'art-custom'}">${icon(item.notes.length ? 'music' : 'play', 21)}</span><span class="song-row-copy"><strong>${esc(item.title)}</strong><small>${item.notes.length ? original ? 'Original exercise' : 'Your arrangement' : videoUrl(item) ? 'Video lesson available' : 'Needs an arrangement'}</small></span>${item.id === song.id ? '<span class="playing-bars"><i></i><i></i><i></i></span>' : icon('play', 14)}</button>`;
}

function renderStage() {
  if (view !== 'practice' || lessonMode !== 'guided' || !song.notes.length) return;
  const index = demo ? demoIndex : practice.index;
  const target = index >= 0 ? song.notes[index]?.midi ?? null : null;
  if (target !== null && (target < base || target > base + 24)) base = Math.max(21, Math.min(84, Math.floor(target / 12) * 12));
  const focusedKey = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.midi : undefined;
  $('#score-container').innerHTML = score(song.notes, index, labels);
  $('#piano-keyboard').innerHTML = keyboard(base, target, labels, pressed);
  if (focusedKey) {
    const key = document.querySelector(`[data-midi="${focusedKey}"]`);
    if (key instanceof HTMLElement) key.focus({ preventScroll: true });
  }
  for (const [container, selected] of [['.keyboard-wrap', '.piano-key.target'], ['#score-container', '.note-highlight']]) {
    const item = document.querySelector(selected);
    if (!item) continue;
    const scroll = $(container);
    const outer = scroll.getBoundingClientRect();
    const inner = item.getBoundingClientRect();
    if (inner.right > outer.right) scroll.scrollLeft += inner.right - outer.right + 12;
    else if (inner.left < outer.left) scroll.scrollLeft -= outer.left - inner.left + 12;
  }
  const filled = practice.finished ? song.notes.length : Math.max(0, index);
  $('#phrase-fill').style.width = `${filled / song.notes.length * 100}%`;
  $('#phrase-count').textContent = `${practice.finished && !demo ? song.notes.length : Math.max(0, index) + 1} / ${song.notes.length}`;
  $('#practice-mode').textContent = demo ? 'Demo playing - just listen' : practice.loop ? 'Looping - one note at a time' : 'Wait-for-note mode';
  const name = target !== null ? noteName(target) : '';
  $('#target-symbol').innerHTML = name ? `${esc(name.slice(0, -1))}<span>${name.at(-1)}</span>` : icon(practice.finished && !demo ? 'check' : 'music', 30);
  $('#target-caption').textContent = demo ? 'LISTEN & FOLLOW ALONG' : practice.finished ? 'YOU PLAYED THE WHOLE PHRASE' : 'YOUR NEXT NOTE';
  $('#target-description').textContent = target === null ? demo ? 'A little breathing room' : 'Lovely work. Play it again?' : target === 60 ? 'Middle C - your home base' : `${name.includes('#') ? 'Black' : 'White'} key - ${name.replace('#', ' sharp ')}`;
  const hearButton = /** @type {HTMLButtonElement} */ ($('[data-action="hear"]'));
  hearButton.disabled = demo || target === null;
  $('#feedback').textContent = demo ? 'Listen first. Demo playback does not count toward your progress.' : feedback;
  $('#feedback').className = `feedback ${demo ? '' : feedbackKind}`;
  $('#today-correct').textContent = String(progress().correct);
}

function updateInput() {
  if (view !== 'practice' || lessonMode !== 'guided' || !song.notes.length) return;
  const button = /** @type {HTMLButtonElement} */ ($('#mic-button'));
  button.innerHTML = icon(mic.running ? 'pause' : 'mic', 18) + (micPending ? ' Waiting for permission...' : mic.running ? ' Pause microphone' : ' Enable microphone');
  button.disabled = micPending || demo;
  $('#input-label').textContent = mic.running ? 'Microphone listening' : micPending ? 'Check your browser permission prompt' : 'Microphone off';
  $('#input-dot').classList.toggle('live', mic.running);
  if (!mic.running) {
    $('#input-meter').style.setProperty('--level', '0%');
    $('#heard').textContent = 'Audio stays on your device';
  }
  $('#demo-button').innerHTML = icon(demo ? 'pause' : 'play', 17) + (demo ? ' Stop demo' : ' Listen to demo');
}

function renderLibrary() {
  $('#page-content').innerHTML = `<section class="library-banner"><span class="library-banner-icon">${icon('book', 32)}</span><div><h2>A song library without limits on taste.</h2><p>Follow a piano video, practice guided notes, or switch between both for the same song.</p></div><button class="button secondary" data-action="midi">${icon('cloud', 18)} Import MIDI</button></section><div class="library-tools"><h2>Your collection <span>${allSongs().length}</span></h2><input type="search" id="song-search" placeholder="Find a song..." aria-label="Search songs" value="${esc(search)}" /></div><div id="song-grid" class="song-grid"></div><div class="library-footnote">${icon('shield', 19)}<span>Your notes and files stay in your browser. Video lessons connect to YouTube only after you choose to load the player. They aren't transcribed.</span></div>`;
  renderSongGrid();
}
function renderSongGrid() {
  const songs = allSongs().filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));
  $('#song-grid').innerHTML = songs.length ? songs.map((item) => {
    const built = BUILTIN_SONGS.findIndex((s) => s.id === item.id);
    const p = progress(item.id);
    const percent = item.notes.length ? Math.min(100, Math.round(p.furthest / item.notes.length * 100)) : 0;
    return `<article class="library-song"><div class="song-cover ${built >= 0 ? `art-${built}` : 'art-custom'}"><span class="cover-lines"></span>${icon(item.notes.length ? 'music' : 'play', 50)}<span class="badge">${built >= 0 ? 'CADENCE ORIGINAL' : item.notes.length ? 'YOUR ARRANGEMENT' : 'YOUR INSPIRATION'}</span></div><div class="library-song-body"><div class="song-meta"><span class="badge ${item.notes.length || videoUrl(item) ? 'mint' : 'amber'}">${item.notes.length ? 'Guided notes ready' : videoUrl(item) ? 'Video lesson available' : 'Needs an arrangement'}</span>${item.notes.length && videoUrl(item) ? '<span class="badge mint">Video linked</span>' : ''}${p.completed ? `<span>${icon('check', 14)} Played through</span>` : ''}</div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><div class="library-song-progress"><span>${item.notes.length ? `${item.notes.filter((n) => n.midi !== null).length} notes` : 'Learn with the video'}</span><span>${item.notes.length ? `${percent}% explored` : 'Guided notes not added'}</span></div><div class="progress-track"><div style="width:${percent}%"></div></div><button class="button ${item.notes.length ? 'secondary' : 'reference-button'} full-width" data-song="${esc(item.id)}">${item.notes.length ? 'Let\'s practice' : 'Open song'}${icon('arrow', 17)}</button></div></article>`;
  }).join('') : '<div class="search-empty">No songs match that search. Try another title.</div>';
}

function renderProgress() {
  const values = Object.values(data.progress);
  const total = values.reduce((a, p) => ({ correct: a.correct + p.correct, seconds: a.seconds + p.seconds, completed: a.completed + p.completed }), { correct: 0, seconds: 0, completed: 0 });
  const practiced = allSongs().filter((s) => progress(s.id).attempts > 0);
  $('#page-content').innerHTML = `<div class="stats-grid"><section class="stat-card"><span class="stat-icon">${icon('music', 23)}</span><span>Notes played correctly</span><strong>${total.correct}</strong><small>Every one counts.</small></section><section class="stat-card"><span class="stat-icon lavender">${icon('clock', 23)}</span><span>Active practice time</span><strong>${Math.floor(total.seconds / 60)}<em> min</em></strong><small>${total.seconds < 60 ? `${Math.floor(total.seconds)} seconds so far` : 'A little time, well spent.'}</small></section><section class="stat-card"><span class="stat-icon peach">${icon('check', 23)}</span><span>Full play-throughs</span><strong>${total.completed}</strong><small>Loops and demos aren't counted.</small></section></div><section class="history-card"><div class="section-heading"><div><h2>Your practice journal</h2><p class="muted">A record of showing up for yourself.</p></div>${icon('book', 25)}</div>${practiced.length ? `<div class="history-list">${practiced.map((s) => {
    const p = progress(s.id);
    return `<button class="history-row" data-song="${esc(s.id)}"><span class="song-art art-0">${icon('music', 21)}</span><span><strong>${esc(s.title)}</strong><small>${new Date(p.lastPlayed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${p.correct} correct notes · ${p.completed} play-throughs</small></span><span class="history-percent">${Math.round(p.correct / p.attempts * 100)}%<small>pitch accuracy</small></span>${icon('arrow', 18)}</button>`;
  }).join('')}</div>` : `<div class="progress-empty">${icon('sun', 40)}<h3>Your first note is a fresh start.</h3><p>Try an exercise, and your progress will begin to grow here.</p><button class="button primary" data-view="practice">Start a little practice ${icon('arrow', 17)}</button></div>`}</section><section class="backup-card"><div>${icon('shield', 28)}<div><h3>Your progress belongs to you.</h3><p>Saved in this browser. Export a backup before clearing site data or moving devices.</p></div></div><div class="backup-actions"><button class="button secondary" data-action="export">${icon('download', 17)} Export backup</button><button class="text-button" data-action="restore">Restore backup</button></div></section>`;
}

/** @param {string} next */
function changeView(next) {
  if (!['practice', 'library', 'progress'].includes(next)) return;
  stopAll();
  persist();
  view = next;
  render();
}
/** @param {string} id */
function selectSong(id) {
  stopAll();
  song = findSong(id);
  lessonMode = defaultLessonMode(song);
  data.selected = song.id;
  practice = new Practice(song.notes);
  tempo = song.bpm;
  base = song.notes[practice.index]?.midi !== null ? Math.max(24, Math.min(84, Math.floor((song.notes[practice.index]?.midi ?? 60) / 12) * 12)) : 60;
  feedback = 'Your piano. Your pace. We wait for every note.';
  feedbackKind = '';
  heard = '';
  view = 'practice';
  persist();
  render();
}

/** @param {number} midi @param {'mic' | 'keyboard'} source */
function playNote(midi, source) {
  if (view !== 'practice' || lessonMode !== 'guided' || !song.notes.length || demo || document.querySelector('dialog[open]')) return;
  if (source === 'keyboard') {
    void sound(midi);
    manualUntil = performance.now() + 30000;
  }
  pressed = midi;
  clearTimeout(pressedTimer);
  pressedTimer = window.setTimeout(() => { pressed = null; renderStage(); }, 180);
  if (practice.finished) { renderStage(); return; }
  const result = practice.play(midi);
  if (result.ignored) return;
  const p = progress();
  p.attempts++;
  p.lastPlayed = new Date().toISOString();
  heard = noteName(midi);
  if (result.correct) {
    p.correct++;
    p.furthest = Math.max(p.furthest, result.completed ? song.notes.length : result.step + 1);
    if (result.completed) {
      p.completed++;
      mic.stop();
      manualUntil = 0;
      feedback = 'A whole melody, played by you. Restart when you\'re ready for another go.';
    } else feedback = `${heard} - lovely. ${practice.loop && practice.index === practice.start ? 'Back to the start of your loop.' : 'On to the next note.'}`;
    feedbackKind = 'success';
  } else {
    feedback = `Heard ${heard}. Try ${noteName(/** @type {number} */ (song.notes[practice.index].midi))} - the green key. Take your time.`;
    feedbackKind = 'try-again';
  }
  data.progress[song.id] = p;
  persist();
  renderStage();
  updateInput();
}

/** @param {number} midi @param {number} [duration] */
async function sound(midi, duration = 0.7) {
  mic.silentUntil = performance.now() + (duration + 0.45) * 1000;
  try { await piano.play(midi, duration); }
  catch (error) { notice(`Audio playback couldn't start: ${message(error)}`, true); }
}

async function toggleMic() {
  if (mic.running || micPending) {
    micRequest++;
    mic.stop();
    micPending = false;
    persist();
    updateInput();
    return;
  }
  if (practice.finished) practice.restart();
  stopDemo();
  const request = ++micRequest;
  micPending = true;
  feedback = 'Allow microphone access, then play the highlighted key. One note at a time.';
  feedbackKind = '';
  renderStage();
  updateInput();
  try {
    const started = await mic.start();
    if (started && request === micRequest) {
      feedback = 'Listening. Play one clear note, without sustain. Release between repeated notes.';
      renderStage();
    }
  } catch (error) {
    if (request !== micRequest) return;
    const name = error instanceof DOMException ? error.name : '';
    const explanation = name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser site settings, then try again.' :
      name === 'NotFoundError' ? 'No microphone was found. Connect one, or practice with the on-screen keys.' :
      name === 'NotReadableError' ? 'Your microphone is unavailable or busy in another app. Close that app and try again.' : message(error);
    notice(explanation, true);
    feedback = explanation;
    feedbackKind = 'try-again';
    renderStage();
  } finally {
    if (request === micRequest) { micPending = false; updateInput(); }
  }
}

function stopDemo() {
  demoGeneration++;
  clearTimeout(demoTimer);
  piano.stop();
  demo = false;
  demoIndex = -1;
}
function stopAll() {
  videoLesson?.unload();
  stopDemo();
  micRequest++;
  mic.stop();
  micPending = false;
  manualUntil = 0;
  pressed = null;
}
async function toggleDemo() {
  if (demo) { stopDemo(); renderStage(); updateInput(); return; }
  stopAll();
  demo = true;
  demoIndex = practice.start;
  const generation = demoGeneration;
  renderStage();
  updateInput();
  try {
    await piano.ready();
    if (generation !== demoGeneration) return;
    const tick = () => {
      if (!demo || generation !== demoGeneration) return;
      if (demoIndex > practice.end) {
        if (practice.loop) demoIndex = practice.start;
        else { stopDemo(); renderStage(); updateInput(); return; }
      }
      const note = song.notes[demoIndex];
      renderStage();
      const duration = note.beats * 60 / tempo;
      if (note.midi !== null) void sound(note.midi, duration * 0.86);
      demoTimer = window.setTimeout(() => { demoIndex++; tick(); }, duration * 1000);
    };
    tick();
  } catch (error) {
    stopDemo();
    notice(`Demo playback couldn't start: ${message(error)}`, true);
    renderStage();
    updateInput();
  }
}

function applyLoop() {
  const start = Number(/** @type {HTMLInputElement} */ ($('#loop-start')).value) - 1;
  const end = Number(/** @type {HTMLInputElement} */ ($('#loop-end')).value) - 1;
  const enabled = /** @type {HTMLInputElement} */ ($('#loop-enabled')).checked;
  try {
    practice.setLoop(start, end, enabled);
    $('#loop-error').hidden = true;
    stopAll();
    feedback = enabled ? `Looping steps ${start + 1}-${end + 1}. Each small section is progress.` : 'Full song practice. Ready when you are.';
    feedbackKind = '';
    renderStage();
    updateInput();
  } catch (error) {
    $('#loop-error').textContent = message(error);
    $('#loop-error').hidden = false;
    /** @type {HTMLInputElement} */ ($('#loop-enabled')).checked = practice.loop;
  }
}

/** @param {import('./core.js').Song} [item] */
function openEditor(item) {
  stopAll();
  updateInput();
  renderStage();
  const built = item && BUILTIN_SONGS.some((s) => s.id === item.id);
  editingId = item && !built ? item.id : '';
  midiData = null;
  $('#track-field').hidden = true;
  $('#editor-error').hidden = true;
  $('#editor-title').textContent = item ? built ? 'Make this melody your own.' : 'A little fine-tuning.' : 'Add your next favorite.';
  /** @type {HTMLInputElement} */ ($('#song-title')).value = item ? `${item.title}${built ? ' (my version)' : ''}` : '';
  /** @type {HTMLInputElement} */ ($('#song-bpm')).value = String(item?.bpm ?? 72);
  /** @type {HTMLTextAreaElement} */ ($('#song-notes')).value = item ? formatNotes(item.notes) : '';
  /** @type {HTMLInputElement} */ ($('#song-reference')).value = item?.reference ?? '';
  /** @type {HTMLInputElement} */ ($('#song-tutorial')).value = item?.tutorial ?? '';
  const oldDelete = document.querySelector('#delete-song');
  oldDelete?.remove();
  if (editingId) $('#editor .modal-actions').insertAdjacentHTML('afterbegin', `<button type="button" class="text-button danger" id="delete-song" data-action="delete">${icon('trash', 16)} Delete</button>`);
  /** @type {HTMLDialogElement} */ ($('#editor')).showModal();
}

/** @param {string} error */
function editorError(error) {
  $('#editor-error').textContent = error;
  $('#editor-error').hidden = false;
}
function fillTrack() {
  if (!midiData) return;
  const index = Number(/** @type {HTMLSelectElement} */ ($('#midi-track')).value);
  try {
    const result = melodyFromTrack(midiData.tracks[index], midiData.division);
    /** @type {HTMLTextAreaElement} */ ($('#song-notes')).value = formatNotes(result.notes);
    $('#editor-error').hidden = true;
    $('#midi-info').textContent = `${result.notes.length} steps. ${result.simplified ? 'Simplified: highest note of simultaneous chords; overlapping notes shortened.' : 'Single-note melody imported.'} Leading silence is removed. Demo uses one adjustable tempo; pedal and tempo changes are not imported.`;
  } catch (error) {
    /** @type {HTMLTextAreaElement} */ ($('#song-notes')).value = '';
    $('#midi-info').textContent = 'Choose another track or enter a shorter melody manually.';
    editorError(message(error));
  }
}

$('#song-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    if (!editingId && data.songs.length >= 100) throw new Error('Your library is full (100 custom songs). Export a backup and remove a song first.');
    const notes = parseNotes(/** @type {HTMLTextAreaElement} */ ($('#song-notes')).value);
    const previous = data.songs.find((s) => s.id === editingId);
    const item = validateSong({
      id: editingId || `song-${crypto.randomUUID()}`,
      title: /** @type {HTMLInputElement} */ ($('#song-title')).value,
      bpm: Number(/** @type {HTMLInputElement} */ ($('#song-bpm')).value),
      notes,
      description: previous?.description ?? (notes.length ? 'Your own little piece of music. Learn it one note at a time.' : 'Saved inspiration. Add a piano arrangement when you are ready.'),
      reference: /** @type {HTMLInputElement} */ ($('#song-reference')).value,
      tutorial: /** @type {HTMLInputElement} */ ($('#song-tutorial')).value,
      source: notes.length ? 'Your arrangement' : 'Your reference'
    });
    if (!notes.length && !videoUrl(item)) throw new Error('Add some piano notes, a piano tutorial, or a YouTube reference to save this song.');
    if (previous && JSON.stringify(previous.notes) !== JSON.stringify(item.notes) && data.progress[previous.id]) {
      if (!confirm('Changing the arrangement resets this song\'s practice history. Save the new notes?')) return;
      delete data.progress[previous.id];
    }
    data.songs = [...data.songs.filter((s) => s.id !== item.id), item];
    /** @type {HTMLDialogElement} */ ($('#editor')).close();
    selectSong(item.id);
    notice(item.notes.length ? 'Guided notes are ready. Switch learning modes any time.' : 'Video link saved. Guided notes will be available once you add an arrangement.');
  } catch (error) { editorError(message(error)); }
});

$('#midi-file').addEventListener('change', async (event) => {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Use a MIDI file smaller than 2 MB.');
    midiData = readMidi(await file.arrayBuffer());
    $('#track-field').hidden = false;
    $('#midi-track').innerHTML = midiData.tracks.map((track, index) => `<option value="${index}">${esc(track.name)} (${track.notes.length} notes)</option>`).join('');
    const title = /** @type {HTMLInputElement} */ ($('#song-title'));
    if (!title.value) title.value = file.name.replace(/\.midi?$/i, '').slice(0, 100);
    /** @type {HTMLInputElement} */ ($('#song-bpm')).value = String(midiData.bpm);
    fillTrack();
  } catch (error) { editorError(message(error)); }
});

$('#backup-file').addEventListener('change', async (event) => {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('Use a backup file smaller than 5 MB.');
    const restored = validateData(JSON.parse(await file.text()));
    if (!confirm('Restore this backup? This replaces your current custom songs and progress on this device. Export your current data first if you want to keep it.')) return;
    stopAll();
    data = restored;
    canSave = true;
    storageError = '';
    $('#storage-warning').hidden = true;
    $('#save-state').textContent = 'Saved on this device';
    selectSong(data.selected);
    notice(canSave ? 'Your songs and progress have been restored.' : 'Backup loaded into memory, but browser storage is unavailable. Keep your backup.', !canSave);
  } catch (error) { notice(`Backup not restored: ${message(error)}`, true); }
});

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('button, a.brand') : null;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches('a.brand')) { event.preventDefault(); changeView('practice'); return; }
  if (target.dataset.view) { changeView(target.dataset.view); return; }
  if (target.dataset.song) { selectSong(target.dataset.song); return; }
  if (target.dataset.lessonMode === 'video' || target.dataset.lessonMode === 'guided') {
    stopAll();
    lessonMode = target.dataset.lessonMode;
    persist();
    render();
    /** @type {HTMLButtonElement} */ ($(`.lesson-switch [data-lesson-mode="${lessonMode}"]`)).focus({ preventScroll: true });
    return;
  }
  if (target.dataset.midi) { playNote(Number(target.dataset.midi), 'keyboard'); return; }
  const action = target.dataset.action;
  if (action === 'add') openEditor();
  else if (action === 'edit') openEditor(song);
  else if (action === 'close-editor') /** @type {HTMLDialogElement} */ ($('#editor')).close();
  else if (action === 'help') { stopAll(); updateInput(); renderStage(); /** @type {HTMLDialogElement} */ ($('#help')).showModal(); }
  else if (action === 'close-help') /** @type {HTMLDialogElement} */ ($('#help')).close();
  else if (action === 'mic') void toggleMic();
  else if (action === 'demo') void toggleDemo();
  else if (action === 'hear') {
    const targetNote = song.notes[practice.index]?.midi;
    if (targetNote !== null && targetNote !== undefined) void sound(targetNote);
  } else if (action === 'restart') {
    stopAll();
    practice.restart();
    feedback = 'A fresh start. Find the green key, and take your time.';
    feedbackKind = '';
    renderStage(); updateInput();
  } else if (action === 'midi') {
    if (!(/** @type {HTMLDialogElement} */ ($('#editor'))).open) openEditor();
    /** @type {HTMLInputElement} */ ($('#midi-file')).click();
  } else if (action === 'export') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('Backup exported. Keep it somewhere safe.');
  } else if (action === 'restore') /** @type {HTMLInputElement} */ ($('#backup-file')).click();
  else if (action === 'delete') {
    if (!confirm('Delete this song and its practice history from this device?')) return;
    data.songs = data.songs.filter((s) => s.id !== editingId);
    delete data.progress[editingId];
    /** @type {HTMLDialogElement} */ ($('#editor')).close();
    selectSong('first-light');
    notice('Song removed from your library.');
  }
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === 'tempo') { tempo = Number(target.value); $('#tempo-value').innerHTML = `${tempo} <small>BPM</small>`; }
  else if (target.id === 'song-search') { search = target.value; renderSongGrid(); }
});
document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id === 'show-labels') { labels = /** @type {HTMLInputElement} */ (target).checked; renderStage(); }
  else if (['loop-enabled', 'loop-start', 'loop-end'].includes(target.id)) applyLoop();
  else if (target.id === 'midi-track') fillTrack();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const dialog = document.querySelector('dialog[open]');
    if (dialog instanceof HTMLDialogElement) {
      event.preventDefault();
      dialog.close();
    }
    return;
  }
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || view !== 'practice' || lessonMode !== 'guided' || document.querySelector('dialog[open]')) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const offset = COMPUTER_KEYS.indexOf(event.key.toLowerCase());
  if (offset < 0 || base + offset > 108) return;
  event.preventDefault();
  playNote(base + offset, 'keyboard');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopAll(); persist(); renderStage(); updateInput(); }
});
window.addEventListener('pagehide', () => { stopAll(); persist(); });
window.setInterval(() => {
  if (view !== 'practice' || lessonMode !== 'guided' || demo || practice.finished || document.hidden || document.querySelector('dialog[open]')) return;
  if (!mic.running && performance.now() > manualUntil) return;
  const p = progress();
  p.seconds++;
  data.progress[song.id] = p;
  if (p.seconds % 5 === 0) persist();
}, 1000);

render();
