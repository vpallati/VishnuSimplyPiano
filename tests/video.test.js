import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSong } from '../src/core.js';
import { BUILTIN_SONGS, EXAMPLE_REFERENCE } from '../src/songs.js';
import { defaultLessonMode, newVideoSession, validateVideoLoop, VideoLesson, videoError, videoMarkup, videoTime, videoUrl } from '../src/video.js';

test('the selected song determines a useful initial learning mode', () => {
  assert.equal(defaultLessonMode(EXAMPLE_REFERENCE), 'video');
  assert.equal(defaultLessonMode(BUILTIN_SONGS[0]), 'guided');
  assert.equal(defaultLessonMode({ ...EXAMPLE_REFERENCE, notes: [{ midi: 60, beats: 1 }] }), 'guided');
  assert.equal(defaultLessonMode({ ...EXAMPLE_REFERENCE, reference: '', tutorial: '' }), 'guided');
  assert.equal(videoUrl(EXAMPLE_REFERENCE), 'https://www.youtube.com/watch?v=hPUseuixiTM');
  assert.equal(videoUrl({ ...EXAMPLE_REFERENCE, tutorial: '' }), EXAMPLE_REFERENCE.reference);
});

test('video tutorials are optional in old songs and validated in new songs', () => {
  assert.equal(validateSong(BUILTIN_SONGS[0]).tutorial, undefined);
  assert.equal(validateSong({ ...EXAMPLE_REFERENCE, tutorial: 'https://youtu.be/hPUseuixiTM?t=30' }).tutorial, EXAMPLE_REFERENCE.tutorial);
  for (const tutorial of [12, null, 'javascript:alert(1)', 'https://evil.example/watch?v=hPUseuixiTM', 'x'.repeat(2049)]) {
    assert.throws(() => validateSong({ ...EXAMPLE_REFERENCE, tutorial }));
  }
});

test('section loops enforce actual boundaries and a half-second minimum', () => {
  for (const range of [[0, 0.5, 60], [1.1, 1.6, 60], [59.5, 60, 60], [0, 60, 60]]) {
    assert.doesNotThrow(() => validateVideoLoop(...range));
  }
  for (const range of [[0, 0.49, 60], [-1, 10, 60], [10, 10, 60], [20, 10, 60], [0, 60.01, 60], [NaN, 5, 60], [0, Infinity, 60], [0, 10, 0]]) {
    assert.throws(() => validateVideoLoop(...range));
  }
});

test('video lessons load no third-party content before consent', () => {
  const markup = videoMarkup(EXAMPLE_REFERENCE);
  assert.match(markup, /Load video lesson/);
  assert.match(markup, /Aditya Lankoti/);
  assert.match(markup, /hPUseuixiTM/);
  assert.match(markup, /Video mode does not detect or score your notes/);
  assert.doesNotMatch(markup, /<(iframe|script|img)\b|\bsrc=/);
  assert.match(videoMarkup(BUILTIN_SONGS[0]), /Add a video link/);
});

test('video state is separate from scored practice and errors have actionable messages', () => {
  assert.deepEqual(newVideoSession(), { position: 0, speed: 1, start: 0, end: 0, loop: false });
  assert.equal(videoTime(125.9), '2:05');
  assert.equal(videoTime(0), '0:00');
  assert.match(videoError(100), /unavailable or private/);
  assert.match(videoError(150), /creator does not allow/);
  assert.match(videoError(153), /referrer/);
  assert.match(videoError(5), /error 5/);
});

test('player lifecycle restores session settings, enforces loops, and cancels stale callbacks', async (t) => {
  const globals = ['window', 'document', 'location', 'clearTimeout', 'clearInterval'];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const key of globals) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  class Element {
    value = '0';
    checked = false;
    hidden = false;
    disabled = true;
    textContent = '';
    innerHTML = '';
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
    replaceChildren() {}
  }
  const elements = new Map();
  const listeners = new Map();
  const root = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); }
  };
  const timers = new Map();
  let timer = 0;
  const schedule = (handler) => { timers.set(++timer, handler); return timer; };
  const players = [];
  class Player {
    time = 0;
    speed = 1;
    state = 2;
    duration = 84;
    seeks = [];
    destroyed = false;
    constructor(element, options) { this.options = options; players.push(this); }
    getDuration() { return this.duration; }
    getCurrentTime() { return this.time; }
    getPlayerState() { return this.state; }
    getPlaybackRate() { return this.speed; }
    getAvailablePlaybackRates() { return [0.25, 0.5, 1, 2]; }
    setPlaybackRate(rate) { this.speed = rate; }
    seekTo(time) { this.time = time; this.seeks.push(time); }
    playVideo() { this.state = 1; }
    pauseVideo() { this.state = 2; }
    destroy() { this.destroyed = true; }
    ready() { this.options.events.onReady({ target: this }); }
    end() { this.options.events.onStateChange({ target: this, data: 0 }); }
  }
  Object.assign(globalThis, {
    window: { YT: { Player }, setInterval: schedule, setTimeout: schedule },
    document: { createElement: () => new Element() },
    location: { origin: 'https://cadence.example' },
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id)
  });
  const session = { position: 2.5, speed: 0.5, start: 2, end: 4, loop: true };
  const lesson = new VideoLesson(root, EXAMPLE_REFERENCE.tutorial, session);
  await lesson.load();
  const player = players[0];
  player.ready();
  assert.equal(player.time, 2.5);
  assert.equal(player.speed, 0.5);
  assert.equal(player.state, 2);
  assert.equal(root.querySelector('#video-controls').disabled, false);
  assert.equal(root.querySelector('#video-loop').checked, true);
  player.state = 1;
  player.time = 3.99;
  player.seeks = [];
  lesson.sync();
  assert.deepEqual(player.seeks, []);
  player.time = 4;
  lesson.sync();
  assert.equal(player.seeks.at(-1), 2);
  player.state = 2;
  player.time = 4;
  player.seeks = [];
  lesson.sync();
  assert.deepEqual(player.seeks, []);
  player.end();
  assert.equal(player.state, 1);
  assert.equal(player.time, 2);
  root.querySelector('#video-start').value = '10';
  root.querySelector('#video-end').value = '5';
  lesson.applyLoop();
  assert.equal(session.start, 2);
  assert.equal(root.querySelector('#video-error').hidden, false);
  root.querySelector('#video-loop').checked = false;
  lesson.applyLoop();
  assert.equal(session.loop, false);
  player.time = 3;
  lesson.unload();
  assert.equal(session.position, 3);
  assert.equal(player.destroyed, true);
  assert.equal(timers.size, 0);
  assert.equal(root.querySelector('#video-controls').disabled, true);
  await lesson.load();
  const stale = players[1];
  lesson.destroy();
  stale.ready();
  assert.equal(lesson.ready, false);
  assert.equal(stale.destroyed, true);
  assert.equal(listeners.size, 0);
  assert.equal(timers.size, 0);
  const pending = new VideoLesson(root, EXAMPLE_REFERENCE.tutorial, newVideoSession());
  const loading = pending.load();
  pending.destroy();
  await loading;
  assert.equal(players.length, 2, 'switching away while API loads must not create a player');
});
