import { formatNotes, parseNotes } from './core.js';
import { PianoAudio } from './audio.js';
import { writeMidi } from './midi.js';
import { draftFromDetection, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, monoSection, TRANSCRIPTION_RATE, validateAudioSection } from './transcription.js';
import { icon } from './visuals.js';

/** @typedef {{ notes: import('./core.js').Step[], bpm: number, title: string }} AudioDraft */

export function audioImportMarkup() {
  return `<dialog id="audio-import" class="modal audio-import-modal" aria-labelledby="audio-import-title">
    <div class="modal-heading"><div><div class="eyebrow">FROM AUDIO TO YOUR PIANO</div><h2 id="audio-import-title">Make a guided-note draft.</h2></div><button class="icon-button" data-audio-action="close" aria-label="Close audio transcription">${icon('close')}</button></div>
    <p class="muted">Choose audio you own or have permission to process. Your file stays on this device. A clean solo instrument works best; a full mix can need substantial correction.</p>
    <p id="audio-import-error" class="form-error" role="alert" hidden></p>
    <label class="audio-file-label" for="audio-file">${icon('cloud', 24)}<strong>Choose an audio file</strong><span>MP3, WAV, or another format your browser can decode. Up to 40 MB and 10 minutes.</span></label>
    <input id="audio-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" />
    <div id="audio-file-info" class="field-hint"></div>
    <audio id="audio-source" controls preload="metadata" aria-label="Original audio on this device" hidden></audio>
    <fieldset id="audio-options" class="audio-options" disabled><legend class="field-label">Choose a short section</legend>
      <div class="audio-option-grid"><div><label class="field-label" for="audio-start">Start (seconds)</label><input id="audio-start" type="number" min="0" step="0.1" value="0" /></div><div><label class="field-label" for="audio-end">End (seconds)</label><input id="audio-end" type="number" min="0.5" step="0.1" value="15" /></div><div><label class="field-label" for="audio-bpm">Lesson tempo</label><input id="audio-bpm" type="number" min="30" max="240" value="72" /></div></div>
      <p class="field-hint">Analyze 0.5-60 seconds at a time. Start with 5 seconds: local processing can take several minutes on slower devices. Tempo converts timing to beats; it is not detected automatically.</p>
      <label class="field-label" for="audio-range">Keep notes in</label><select id="audio-range"><option value="all">Full piano range (A0-C8)</option><option value="middle">Middle register (C3-C6) - remove low bass and very high notes</option></select>
      <button class="button primary full-width" id="audio-analyze" data-audio-action="analyze">${icon('spark', 17)} Generate draft notes</button>
    </fieldset>
    <div class="audio-work"><progress id="audio-progress" max="1" value="0" aria-label="Transcription progress" hidden></progress><p id="audio-status" role="status" class="muted">The model loads from this site only when you start analysis. No audio is sent to a server.</p><button class="text-button" id="audio-cancel" data-audio-action="cancel" hidden>Cancel processing</button></div>
    <section id="audio-result" hidden><h3>Listen. Check. Make it yours.</h3><p id="audio-summary" class="field-hint"></p><div class="editor-note">${icon('help', 18)}<span>This is an experimental draft, not a verified arrangement. Simultaneous pitches are reduced to the highest active note; that may be accompaniment or an overtone, not the melody. Leading silence is removed. No beat grid, fingering, or hand arrangement is inferred.</span></div>
      <label class="field-label" for="audio-notes">Editable draft notes</label><textarea id="audio-notes" rows="5" spellcheck="false" aria-describedby="audio-notes-help"></textarea><p id="audio-notes-help" class="field-hint">C4 is middle C. F#4 is a black key, C4:2 is two beats, and R:1 is a rest. Correct unwanted or missing notes before practicing. Up to 512 steps.</p>
      <div class="audio-result-actions"><button class="button secondary" data-audio-action="preview" id="audio-preview">${icon('play', 16)} Hear draft</button><button class="button secondary" data-audio-action="export">${icon('download', 16)} Download MIDI</button><button class="button primary" data-audio-action="use">${icon('check', 16)} Use these notes</button></div>
      <p class="field-hint">Using this draft fills the song editor. Nothing is saved until you choose Save song. New analysis replaces the current draft.</p>
    </section>
    <p class="audio-attribution">Local transcription by <a href="https://github.com/spotify/basic-pitch-ts" target="_blank" rel="noopener noreferrer">Basic Pitch</a> (Spotify, Apache-2.0) and TensorFlow.js. <a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener noreferrer">Third-party licenses</a>. No YouTube downloading is included.</p>
  </dialog>`;
}

export class AudioImport {
  /** @param {HTMLDialogElement} dialog @param {(draft: AudioDraft) => boolean} onUse */
  constructor(dialog, onUse) {
    this.dialog = dialog;
    this.onUse = onUse;
    /** @type {AudioBuffer | null} */
    this.buffer = null;
    /** @type {Worker | null} */
    this.worker = null;
    this.fileUrl = '';
    this.filename = '';
    this.generation = 0;
    this.watchdog = 0;
    this.previewTimer = 0;
    this.previewGeneration = 0;
    this.previewing = false;
    this.draftBpm = 72;
    this.piano = new PianoAudio();
    this.element('#audio-file').addEventListener('change', (event) => {
      const input = /** @type {HTMLInputElement} */ (event.target);
      const file = input.files?.[0];
      input.value = '';
      if (file) void this.loadFile(file);
    });
    this.element('#audio-notes').addEventListener('input', () => this.pause());
    this.element('#audio-source').addEventListener('play', () => this.stopPreview());
    dialog.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-audio-action]') : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const action = target.dataset.audioAction;
      if (action === 'close') this.close();
      else if (action === 'cancel') this.cancel();
      else if (action === 'analyze') this.analyze();
      else if (action === 'preview') void this.preview();
      else if (action === 'export' || action === 'use') {
        try {
          const notes = this.readDraft();
          this.pause();
          if (action === 'use') {
            if (this.onUse({ notes, bpm: this.draftBpm, title: this.filename.replace(/\.[^.]+$/, '').slice(0, 100) })) this.close();
          } else {
            const url = URL.createObjectURL(new Blob([writeMidi(notes, this.draftBpm)], { type: 'audio/midi' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${this.filename.replace(/\.[^.]+$/, '') || 'cadence'}-draft.mid`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.status('MIDI exported. This is the edited single-note draft, not the original recording.');
          }
        } catch (error) { this.error(error); }
      }
    });
    dialog.addEventListener('close', () => this.reset());
  }

  /** @template {HTMLElement} T @param {string} selector @returns {T} */
  element(selector) {
    const element = this.dialog.querySelector(selector);
    if (!element) throw new Error(`Missing audio import control: ${selector}`);
    return /** @type {T} */ (element);
  }
  /** @param {string} selector @returns {HTMLInputElement} */
  input(selector) { return this.element(selector); }
  /** @param {string} text */
  status(text) { this.element('#audio-status').textContent = text; }
  /** @param {unknown} error */
  error(error) {
    this.element('#audio-import-error').textContent = error instanceof Error ? error.message : String(error);
    this.element('#audio-import-error').hidden = false;
  }
  /** @param {boolean} busy */
  setBusy(busy) {
    this.input('#audio-file').disabled = busy;
    /** @type {HTMLFieldSetElement} */ (this.element('#audio-options')).disabled = busy || !this.buffer;
    this.element('#audio-cancel').hidden = !busy;
    this.element('#audio-progress').hidden = !busy;
  }

  /** @param {number} bpm */
  open(bpm) {
    this.reset();
    this.input('#audio-bpm').value = String(bpm);
    this.dialog.showModal();
  }
  close() { this.dialog.close(); }
  stopPreview() {
    this.previewGeneration++;
    clearTimeout(this.previewTimer);
    this.piano.stop();
    this.previewing = false;
    this.element('#audio-preview').textContent = 'Hear draft';
  }
  pause() {
    this.stopPreview();
    /** @type {HTMLAudioElement} */ (this.element('#audio-source')).pause();
  }
  cancel() {
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    clearTimeout(this.watchdog);
    this.setBusy(false);
    this.status('Processing canceled. No notes were saved.');
  }
  reset() {
    this.cancel();
    this.pause();
    this.buffer = null;
    const source = /** @type {HTMLAudioElement} */ (this.element('#audio-source'));
    source.removeAttribute('src');
    source.load();
    source.hidden = true;
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileUrl = '';
    this.filename = '';
    this.input('#audio-file').value = '';
    this.element('#audio-file-info').textContent = '';
    this.element('#audio-import-error').hidden = true;
    this.element('#audio-result').hidden = true;
    /** @type {HTMLTextAreaElement} */ (this.element('#audio-notes')).value = '';
    this.setBusy(false);
    this.status('The model loads from this site only when you start analysis. No audio is sent to a server.');
  }

  /** @param {File} file */
  async loadFile(file) {
    this.reset();
    const generation = this.generation;
    try {
      if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error('Choose a non-empty audio file no larger than 40 MB.');
      this.setBusy(true);
      this.status('Reading audio locally. Large files may take a moment...');
      const encoded = await file.arrayBuffer();
      if (generation !== this.generation) return;
      const decoder = new OfflineAudioContext(1, 1, TRANSCRIPTION_RATE);
      let buffer;
      try { buffer = await decoder.decodeAudioData(encoded); }
      catch { throw new Error('This browser could not decode that audio file. Try an MP3 or uncompressed WAV file.'); }
      if (generation !== this.generation) return;
      if (buffer.duration < 0.5 || buffer.duration > MAX_AUDIO_SECONDS) throw new Error('Use a file between 0.5 seconds and 10 minutes. Trim longer recordings first.');
      this.buffer = buffer;
      this.filename = file.name;
      this.input('#audio-start').value = '0';
      this.input('#audio-end').value = String(Math.min(5, Math.floor(buffer.duration * 10) / 10));
      this.input('#audio-start').max = String(buffer.duration);
      this.input('#audio-end').max = String(buffer.duration);
      this.element('#audio-file-info').textContent = `${file.name} - ${buffer.duration.toFixed(1)} seconds, ${(file.size / 1_000_000).toFixed(1)} MB`;
      this.fileUrl = URL.createObjectURL(file);
      const source = /** @type {HTMLAudioElement} */ (this.element('#audio-source'));
      source.src = this.fileUrl;
      source.hidden = false;
      this.status('Audio ready. Choose a clear section and generate a draft.');
    } catch (error) {
      if (generation === this.generation) this.error(error);
    } finally {
      if (generation === this.generation) this.setBusy(false);
    }
  }

  analyze() {
    try {
      if (!this.buffer) throw new Error('Choose an audio file first.');
      const start = this.input('#audio-start').valueAsNumber;
      const end = this.input('#audio-end').valueAsNumber;
      const bpm = this.input('#audio-bpm').valueAsNumber;
      validateAudioSection(start, end, this.buffer.duration, bpm);
      const samples = monoSection(this.buffer, start, end);
      const middleOnly = /** @type {HTMLSelectElement} */ (this.element('#audio-range')).value === 'middle';
      this.cancel();
      this.pause();
      this.element('#audio-result').hidden = true;
      this.element('#audio-import-error').hidden = true;
      this.setBusy(true);
      this.draftBpm = bpm;
      /** @type {HTMLProgressElement} */ (this.element('#audio-progress')).value = 0;
      this.status('Starting the local transcription worker...');
      const generation = this.generation;
      const worker = new Worker(new URL('./transcription-worker.js', import.meta.url), { type: 'module' });
      this.worker = worker;
      const fail = (/** @type {unknown} */ error) => {
        if (generation !== this.generation) return;
        this.cancel();
        this.status('No draft was generated. Adjust the section or file and try again.');
        this.error(error);
      };
      const watch = () => {
        clearTimeout(this.watchdog);
        this.watchdog = window.setTimeout(() => fail(new Error('The transcription engine stopped responding. Try a shorter clip or a recent Chrome/Edge browser.')), 120000);
      };
      watch();
      worker.onerror = (event) => fail(new Error(`The transcription worker could not run: ${event.message}`));
      worker.onmessageerror = () => fail(new Error('The browser could not read the transcription result.'));
      worker.onmessage = (/** @type {MessageEvent<import('./transcription.js').TranscriptionMessage>} */ event) => {
        if (generation !== this.generation) return;
        const response = event.data;
        if (response.kind === 'error') { fail(new Error(response.message)); return; }
        if (response.kind === 'progress') {
          watch();
          /** @type {HTMLProgressElement} */ (this.element('#audio-progress')).value = response.percent;
          this.status(`${response.stage} ${Math.round(response.percent * 100)}%`);
          return;
        }
        try {
          const draft = draftFromDetection(response.notes, end - start, bpm, middleOnly);
          worker.terminate();
          this.worker = null;
          clearTimeout(this.watchdog);
          this.setBusy(false);
          /** @type {HTMLTextAreaElement} */ (this.element('#audio-notes')).value = formatNotes(draft.notes);
          this.element('#audio-summary').textContent = `${draft.notes.filter((note) => note.midi !== null).length} notes, ${draft.notes.length} total steps at ${bpm} BPM. ${draft.detected} model detections; ${draft.filtered} filtered out.${draft.overlaps ? ' Overlapping pitches were simplified.' : ''} Changing section options requires generating a new draft.`;
          this.element('#audio-result').hidden = false;
          this.status('Draft ready. Listen and correct it before using it for guided practice.');
        } catch (error) { fail(error); }
      };
      /** @type {import('./transcription.js').TranscriptionRequest} */
      const request = {
        samples,
        modelUrl: new URL('./transcription/model/model.json', document.baseURI).href
      };
      worker.postMessage(request, [samples.buffer]);
    } catch (error) {
      this.cancel();
      this.error(error);
    }
  }

  readDraft() {
    const notes = parseNotes(/** @type {HTMLTextAreaElement} */ (this.element('#audio-notes')).value);
    if (!notes.some((note) => note.midi !== null)) throw new Error('Add at least one piano note to the draft.');
    return notes;
  }

  async preview() {
    if (this.previewing) { this.pause(); return; }
    try {
      const notes = this.readDraft();
      this.pause();
      this.previewing = true;
      const generation = this.previewGeneration;
      this.element('#audio-preview').textContent = 'Stop draft';
      await this.piano.ready();
      if (generation !== this.previewGeneration) return;
      let index = 0;
      const next = async () => {
        if (generation !== this.previewGeneration) return;
        if (index >= notes.length) { this.pause(); return; }
        const note = notes[index++];
        const seconds = note.beats * 60 / this.draftBpm;
        try {
          if (note.midi !== null) await this.piano.play(note.midi, seconds * 0.86);
          if (generation === this.previewGeneration) this.previewTimer = window.setTimeout(() => { void next(); }, seconds * 1000);
        } catch (error) { this.pause(); this.error(error); }
      };
      void next();
    } catch (error) { this.pause(); this.error(error); }
  }
}
