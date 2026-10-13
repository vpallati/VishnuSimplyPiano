import { referenceUrl } from './core.js';
import { escapeHtml as esc, icon } from './visuals.js';

/** @typedef {{ position: number, speed: number, start: number, end: number, loop: boolean }} VideoSession */
/** @typedef {{ playVideo(): void, pauseVideo(): void, seekTo(seconds: number, allowSeekAhead: boolean): void, getCurrentTime(): number, getDuration(): number, getPlayerState(): number, getPlaybackRate(): number, getAvailablePlaybackRates(): number[], setPlaybackRate(rate: number): void, destroy(): void }} YouTubePlayer */
/** @typedef {{ target: YouTubePlayer, data: number }} PlayerEvent */
/** @typedef {{ Player: new (element: HTMLElement, options: { host: string, videoId: string, playerVars: { origin: string, playsinline: number, rel: number }, events: { onReady(event: PlayerEvent): void, onStateChange(event: PlayerEvent): void, onError(event: PlayerEvent): void } }) => YouTubePlayer }} YouTubeApi */

/** @param {import('./core.js').Song} song */
export function videoUrl(song) { return song.tutorial || song.reference; }

/** @param {import('./core.js').Song} song @returns {'video' | 'guided'} */
export function defaultLessonMode(song) {
  return !song.notes.length && videoUrl(song) ? 'video' : 'guided';
}

export function newVideoSession() {
  return { position: 0, speed: 1, start: 0, end: 0, loop: false };
}

/** @param {number} start @param {number} end @param {number} duration */
export function validateVideoLoop(start, end, duration) {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0) throw new Error('Load the video and enter both loop times in seconds.');
  if (start < 0 || end > duration || end - start < 0.5) throw new Error('Choose at least half a second, with the start before the end and both times within the video.');
}

/** @param {number} seconds */
export function videoTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/** @param {number} code */
export function videoError(code) {
  if (code === 100) return 'This video is unavailable or private. Choose another tutorial in Edit song.';
  if (code === 101 || code === 150) return 'The creator does not allow this video to play inside other sites. Use Open on YouTube below.';
  if (code === 153) return 'YouTube could not verify this player. Browser privacy or referrer settings may block it. Use Open on YouTube below.';
  if (code === 2) return 'YouTube rejected this video link. Check the tutorial URL in Edit song.';
  return `YouTube could not play this video (error ${code}). Retry loading it or use Open on YouTube below.`;
}

/** @type {Promise<YouTubeApi> | null} */
let apiPromise = null;

function loadYouTube() {
  const host = /** @type {Window & { YT?: YouTubeApi, onYouTubeIframeAPIReady?: () => void }} */ (window);
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    const timeout = window.setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timeout);
      script.remove();
      apiPromise = null;
      reject(new Error('YouTube did not load. Check your connection or content blocker, then retry. You can also open the tutorial directly below.'));
    }
    script.onerror = fail;
    host.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      if (host.YT?.Player) resolve(host.YT);
      else fail();
    };
    document.head.append(script);
  });
  return apiPromise;
}

/** @param {import('./core.js').Song} song */
export function videoMarkup(song) {
  const url = videoUrl(song);
  if (!url) return `<div class="arrangement-empty"><div class="empty-icon">${icon('play', 36)}</div><h3>A video lesson for this melody.</h3><p>Add a piano tutorial or reference link in the song editor. Guided notes are still available in the other mode.</p><button class="button primary" data-action="edit">${icon('plus', 18)} Add a video link</button></div>`;
  const attribution = song.tutorial === 'https://www.youtube.com/watch?v=hPUseuixiTM' ? 'Piano cover and tutorial by Aditya Lankoti' : song.tutorial ? 'Your piano tutorial' : 'Your reference video - not necessarily a piano tutorial';
  return `<section id="video-lesson" class="video-lesson" aria-label="Video lesson">
    <div class="video-intro"><h3>Watch a little. Play a little.</h3><p>${esc(attribution)}. Follow along on your piano; slow down and repeat a small section.</p></div>
    <div id="video-consent" class="video-consent"><span class="video-play-mark">${icon('play', 34)}</span><h3>Your song, at your speed.</h3><p>Loading the player connects to YouTube/Google, which may receive device data and use cookies. No video or audio is downloaded by Cadence.</p><button id="video-load" class="button primary" data-video-action="load">${icon('play', 17)} Load video lesson</button></div>
    <div id="video-mount" class="video-mount" hidden></div>
    <p id="video-error" class="form-error" role="alert" hidden></p>
    <div class="video-links"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open on YouTube ${icon('external', 14)}</a><span id="video-clock">Not loaded</span></div>
    <fieldset id="video-controls" class="video-controls" disabled>
      <legend class="visually-hidden">Video playback controls</legend>
      <div class="video-transport"><button id="video-play" class="button secondary" data-video-action="play">Play / pause</button><label for="video-speed">Speed</label><select id="video-speed"><option value="1">1x</option></select><button class="text-button" data-video-action="back">Back 5 seconds</button></div>
      <fieldset id="video-loop-settings" class="video-loop-settings" disabled><legend>Repeat a small section</legend><div class="video-loop-fields"><div><label for="video-start">Start (seconds)</label><input id="video-start" type="number" min="0" step="0.1" value="0" /><button class="text-button" data-video-action="mark-start">Use current time</button></div><div><label for="video-end">End (seconds)</label><input id="video-end" type="number" min="0.5" step="0.1" value="0" /><button class="text-button" data-video-action="mark-end">Use current time</button></div></div><label class="video-loop-toggle"><input id="video-loop" type="checkbox" /> Loop this section</label></fieldset>
    </fieldset>
    <p id="video-status" class="video-status" role="status">Load the video, then press Play. Your microphone stays off in this mode.</p>
    <div class="editor-note">${icon('help', 18)}<span>Video mode does not detect or score your notes. Switch to Guided notes for wait-for-note practice${song.notes.length ? '.' : ' after adding an arrangement. No notes for this song have been bundled.'} Your video position and loop are remembered while this app remains open.</span></div>
  </section>`;
}

export class VideoLesson {
  /** @param {HTMLElement} root @param {string} url @param {VideoSession} session */
  constructor(root, url, session) {
    this.root = root;
    this.url = referenceUrl(url);
    this.session = session;
    /** @type {YouTubePlayer | null} */
    this.player = null;
    this.ready = false;
    this.generation = 0;
    this.timer = 0;
    this.readyTimeout = 0;
    this.duration = 0;
    this.lastPlaying = false;
    this.onClick = (/** @type {Event} */ event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-video-action]') : null;
      if (!(button instanceof HTMLButtonElement)) return;
      const action = button.dataset.videoAction;
      if (action === 'load') { void this.load(); return; }
      if (!this.ready || !this.player) return;
      if (action === 'play') {
        if (this.player.getPlayerState() === 1) this.player.pauseVideo();
        else this.player.playVideo();
      } else if (action === 'back') this.player.seekTo(Math.max(this.session.loop ? this.session.start : 0, this.player.getCurrentTime() - 5), true);
      else if (action === 'mark-start' || action === 'mark-end') {
        this.input(action === 'mark-start' ? '#video-start' : '#video-end').value = String(Math.floor(this.player.getCurrentTime() * 10) / 10);
        this.applyLoop();
      }
    };
    this.onChange = (/** @type {Event} */ event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !this.ready || !this.player) return;
      if (target.id === 'video-speed') {
        const rate = Number(/** @type {HTMLSelectElement} */ (target).value);
        if (!this.player.getAvailablePlaybackRates().includes(rate)) {
          this.showError('That playback speed is not supported by this video.');
          return;
        }
        this.player.setPlaybackRate(rate);
      } else if (['video-start', 'video-end', 'video-loop'].includes(target.id)) this.applyLoop();
    };
    root.addEventListener('click', this.onClick);
    root.addEventListener('change', this.onChange);
  }

  /** @template {HTMLElement} T @param {string} selector @returns {T} */
  element(selector) {
    const element = this.root.querySelector(selector);
    if (!element) throw new Error(`Missing video control: ${selector}`);
    return /** @type {T} */ (element);
  }
  /** @param {string} selector @returns {HTMLInputElement} */
  input(selector) { return this.element(selector); }
  /** @param {string} text */
  showError(text) {
    this.element('#video-error').textContent = text;
    this.element('#video-error').hidden = false;
  }

  async load() {
    this.unload();
    const generation = this.generation;
    this.element('#video-error').hidden = true;
    const button = /** @type {HTMLButtonElement} */ (this.element('#video-load'));
    button.disabled = true;
    button.textContent = 'Loading YouTube...';
    this.element('#video-status').textContent = 'Connecting to YouTube. The microphone is off.';
    try {
      const api = await loadYouTube();
      if (generation !== this.generation) return;
      const mount = this.element('#video-mount');
      const frame = document.createElement('div');
      mount.replaceChildren(frame);
      mount.hidden = false;
      this.element('#video-consent').hidden = true;
      this.readyTimeout = window.setTimeout(() => {
        if (generation !== this.generation) return;
        this.unload();
        this.showError('The YouTube player did not become ready. Retry or open the tutorial directly below.');
      }, 30000);
      this.player = new api.Player(frame, {
        host: 'https://www.youtube-nocookie.com',
        videoId: /** @type {string} */ (new URL(this.url).searchParams.get('v')),
        playerVars: { origin: location.origin, playsinline: 1, rel: 0 },
        events: {
          onReady: ({ target }) => {
            if (generation !== this.generation) return;
            clearTimeout(this.readyTimeout);
            this.ready = true;
            const rates = target.getAvailablePlaybackRates();
            this.element('#video-speed').innerHTML = rates.map((rate) => `<option value="${rate}">${rate}x</option>`).join('');
            if (rates.includes(this.session.speed)) target.setPlaybackRate(this.session.speed);
            /** @type {HTMLFieldSetElement} */ (this.element('#video-controls')).disabled = false;
            this.element('#video-status').textContent = 'Press Play in the video or below. Pause whenever you want to try a phrase.';
            this.sync();
            this.timer = window.setInterval(() => this.sync(), 200);
          },
          onStateChange: ({ data, target }) => {
            if (generation !== this.generation || !this.ready) return;
            if (data === 0 && this.session.loop) {
              target.seekTo(this.session.start, true);
              target.playVideo();
            }
            this.sync();
          },
          onError: ({ data }) => {
            if (generation !== this.generation) return;
            this.unload();
            this.showError(videoError(data));
          }
        }
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.unload();
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }

  sync() {
    if (!this.ready || !this.player) return;
    const player = this.player;
    const duration = player.getDuration();
    if (duration > 0 && this.duration === 0) {
      this.duration = duration;
      if (this.session.end > duration || this.session.end <= this.session.start) {
        this.session.start = 0;
        this.session.end = duration;
        this.session.loop = false;
      }
      this.input('#video-start').value = String(this.session.start);
      this.input('#video-end').value = String(this.session.end);
      this.input('#video-start').max = String(duration);
      this.input('#video-end').max = String(duration);
      this.input('#video-loop').checked = this.session.loop;
      /** @type {HTMLFieldSetElement} */ (this.element('#video-loop-settings')).disabled = false;
      if (this.session.position > 0 && this.session.position < duration) {
        player.seekTo(this.session.position, true);
        player.pauseVideo();
      }
    }
    const position = player.getCurrentTime();
    const playing = player.getPlayerState() === 1;
    if (this.session.loop && playing && this.duration > 0 && (position >= this.session.end || position < this.session.start)) player.seekTo(this.session.start, true);
    this.session.position = position;
    this.session.speed = player.getPlaybackRate();
    /** @type {HTMLSelectElement} */ (this.element('#video-speed')).value = String(this.session.speed);
    this.element('#video-clock').textContent = `${videoTime(position)} / ${videoTime(duration)}`;
    this.element('#video-play').textContent = playing ? 'Pause video' : 'Play video';
    if (playing !== this.lastPlaying) {
      this.element('#video-status').textContent = playing ? 'Watch the hands, then pause and try the phrase on your piano.' : 'Video paused. Take your time at the piano.';
      this.lastPlaying = playing;
    }
  }

  applyLoop() {
    if (!this.player || !this.ready) return;
    const enabled = this.input('#video-loop').checked;
    if (!enabled) this.session.loop = false;
    try {
      const start = this.input('#video-start').valueAsNumber;
      const end = this.input('#video-end').valueAsNumber;
      validateVideoLoop(start, end, this.duration);
      Object.assign(this.session, { start, end, loop: enabled });
      this.element('#video-error').hidden = true;
      this.element('#video-status').textContent = enabled ? `Repeating ${videoTime(start)} to ${videoTime(end)}. Press Play to practice this section.` : 'Section repeat is off.';
      if (enabled) this.player.seekTo(start, true);
    } catch (error) {
      this.input('#video-loop').checked = this.session.loop;
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }

  unload() {
    this.generation++;
    clearTimeout(this.readyTimeout);
    clearInterval(this.timer);
    if (this.player && this.ready) {
      this.session.position = this.player.getCurrentTime();
      this.session.speed = this.player.getPlaybackRate();
    }
    this.ready = false;
    this.player?.destroy();
    this.player = null;
    this.duration = 0;
    this.lastPlaying = false;
    this.element('#video-mount').replaceChildren();
    this.element('#video-mount').hidden = true;
    this.element('#video-clock').textContent = `${videoTime(this.session.position)} saved`;
    this.element('#video-consent').hidden = false;
    const button = /** @type {HTMLButtonElement} */ (this.element('#video-load'));
    button.disabled = false;
    button.textContent = this.session.position > 0 ? 'Reload video lesson' : 'Load video lesson';
    /** @type {HTMLFieldSetElement} */ (this.element('#video-controls')).disabled = true;
    /** @type {HTMLFieldSetElement} */ (this.element('#video-loop-settings')).disabled = true;
    this.element('#video-status').textContent = 'Video stopped. Load it when you are ready; your position is kept for this session.';
  }

  destroy() {
    this.unload();
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('change', this.onChange);
  }
}
