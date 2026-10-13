import { detectPitch, frequencyForNote, NoteGate, noteForFrequency } from './core.js';

export class PianoAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.context = null;
    /** @type {Set<OscillatorNode>} */
    this.voices = new Set();
    this.silentUntil = 0;
    this.generation = 0;
  }

  async ready() {
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
    await this.context.resume();
    return this.context;
  }

  /** @param {number} midi @param {number} [duration] */
  async play(midi, duration = 0.7) {
    const generation = this.generation;
    const ctx = await this.ready();
    if (generation !== this.generation) return;
    const now = ctx.currentTime;
    const length = Math.max(0.12, Math.min(duration, 8));
    this.silentUntil = performance.now() + (length + 0.25) * 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.065, now + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    gain.connect(ctx.destination);
    for (const [multiple, volume] of [[1, 1], [2, 0.3], [3, 0.09]]) {
      const osc = ctx.createOscillator();
      const harmonic = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequencyForNote(midi) * multiple;
      harmonic.gain.value = volume;
      osc.connect(harmonic).connect(gain);
      osc.start(now);
      osc.stop(now + length + 0.03);
      this.voices.add(osc);
      osc.onended = () => {
        this.voices.delete(osc);
        osc.disconnect();
        harmonic.disconnect();
      };
    }
  }

  stop() {
    this.generation++;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
  }
}

export class Microphone {
  /** @param {(midi: number) => void} onNote
   * @param {(pitch: {midi: number, cents: number} | null, level: number) => void} onLevel
   * @param {(error: string) => void} onEnded
   */
  constructor(onNote, onLevel, onEnded) {
    this.onNote = onNote;
    this.onLevel = onLevel;
    this.onEnded = onEnded;
    /** @type {MediaStream | null} */
    this.stream = null;
    /** @type {AudioContext | null} */
    this.context = null;
    /** @type {MediaStreamAudioSourceNode | null} */
    this.source = null;
    this.timer = 0;
    this.generation = 0;
    this.running = false;
    this.silentUntil = 0;
    this.gate = new NoteGate();
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs HTTPS or localhost and a supported browser. Try Chrome or Edge.');
    this.stop();
    const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    });
    if (generation !== this.generation) { stream.getTracks().forEach((t) => t.stop()); return false; }
    this.stream = stream;
    try {
      this.context = new AudioContext();
      await this.context.resume();
      if (generation !== this.generation || !this.context) return false;
      this.source = this.context.createMediaStreamSource(stream);
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 2048;
      this.source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      this.gate = new NoteGate();
      this.running = true;
      stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => {
        if (this.running) { this.stop(); this.onEnded('The microphone disconnected. Reconnect it and enable listening again.'); }
      }));
      this.timer = window.setInterval(() => {
        if (!this.context) return;
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const value of samples) energy += value * value;
        const level = Math.min(1, Math.sqrt(energy / samples.length) * 6);
        const pitch = detectPitch(samples, this.context.sampleRate);
        const note = pitch ? noteForFrequency(pitch.frequency) : null;
        this.onLevel(note, level);
        const now = performance.now();
        const accepted = this.gate.update(now < this.silentUntil || !note || Math.abs(note.cents) > 35 ? null : note.midi, now);
        if (accepted !== null) this.onNote(accepted);
      }, 65);
      return true;
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop() {
    this.generation++;
    this.running = false;
    clearInterval(this.timer);
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch((error) => this.onEnded(`Could not close the audio device: ${error.message}`));
    }
    this.context = null;
  }
}
