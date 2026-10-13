import test from 'node:test';
import assert from 'node:assert/strict';
import { PianoAudio } from '../src/audio.js';

test('stopping a preview cancels notes waiting for audio startup', async () => {
  const piano = new PianoAudio();
  let resume;
  let created = false;
  piano.ready = () => new Promise((resolve) => { resume = resolve; });
  const playing = piano.play(60);
  piano.stop();
  resume({ currentTime: 0, createGain() { created = true; throw new Error('Canceled note was played'); } });
  await playing;
  assert.equal(created, false);
  assert.equal(piano.voices.size, 0);
});
