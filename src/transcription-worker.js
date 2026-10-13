import * as tf from '@tensorflow/tfjs';
import { BasicPitch, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import { MAX_CLIP_SECONDS, TRANSCRIPTION_RATE } from './transcription.js';

/** @param {import('./transcription.js').TranscriptionMessage} message */
function send(message) { self.postMessage(message); }

self.onmessage = async (/** @type {MessageEvent<import('./transcription.js').TranscriptionRequest>} */ event) => {
  try {
    const { samples, modelUrl } = event.data;
    if (!(samples instanceof Float32Array) || samples.length < TRANSCRIPTION_RATE / 2 || samples.length > MAX_CLIP_SECONDS * TRANSCRIPTION_RATE) {
      throw new Error('The selected audio section is outside the supported length.');
    }
    send({ kind: 'progress', percent: 0, stage: 'Loading the local transcription engine...' });
    if (!await tf.setBackend('cpu')) throw new Error('Local audio processing is unavailable. Try a recent Chrome or Edge browser.');
    await tf.ready();
    send({ kind: 'progress', percent: 0, stage: 'Loading the pitch detection model...' });
    const pitch = new BasicPitch(modelUrl);
    const model = await pitch.model;
    /** @type {number[][]} */
    const frames = [];
    /** @type {number[][]} */
    const onsets = [];
    try {
      await pitch.evaluateModel(samples, (frame, onset) => {
        frames.push(...frame);
        onsets.push(...onset);
      }, (percent) => send({ kind: 'progress', percent, stage: 'Detecting pitches on your device (CPU; this may be slow)...' }));
      send({ kind: 'progress', percent: 1, stage: 'Turning detections into editable notes...' });
      const notes = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.5, 0.3, 8));
      send({ kind: 'result', notes });
    } finally { model.dispose(); }
  } catch (error) {
    console.error('Local audio transcription failed', error);
    send({ kind: 'error', message: `Audio transcription failed: ${error instanceof Error ? error.message : String(error)}. Try a shorter solo-instrument section.` });
  }
};
