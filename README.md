# Cadence - VishnuSimplyPiano

**Your piano. Your pace.** A free, open-source, browser-only piano practice studio.

Cadence is a working beginner trainer, not a clone of Simply Piano and not an automatic YouTube transcription service. There are no accounts, subscriptions, API keys, runtime third-party dependencies, or backend services.

Repository: [vpallati/VishnuSimplyPiano](https://github.com/vpallati/VishnuSimplyPiano)

GitHub Pages address: [Open Cadence](https://vpallati.github.io/VishnuSimplyPiano/) (available after the first successful deployment).

## Try it locally

Requires Node.js **22.12 or later**.

```powershell
npm install
npm run dev
```

Open the localhost URL printed by Vite. Click **Listen to demo**, then try the green piano key. You can click the keys, press the computer-key labels, or enable your microphone and play a real piano.

Do not double-click the HTML file: ES modules and microphone access need a local web server or an HTTPS host.

## What works

- Three original, freely usable starter exercises: First Light, Little Steps, and After the Rain.
- Wait-for-note practice: only the correct pitch **and octave** advances the lesson.
- Local microphone pitch detection with stable-note filtering and repeated-note release detection.
- Simplified treble/bass notation, optional note names, and a highlighted on-screen keyboard.
- Synthesized note previews and demo playback at 30-240 BPM.
- Loops over an inclusive range of numbered steps, including notes and rests.
- A personal library with a note editor, YouTube reference links, and MIDI track import.
- Correct-note counts, pitch accuracy, full play-throughs, and active practice time.
- Browser-local persistence, JSON backup export/restore, and responsive desktop/mobile layouts.

Demo playback never increases progress. Wrong pitches count as attempts but do not advance. Loop completions do not count as full play-throughs. Active time runs while the microphone listens or for up to 30 seconds after on-screen/computer input; background tabs, dialogs, demos, and completed phrases are excluded. Changing an arrangement asks before resetting its history.

## Your example song

**Yogeshwaraya Mahadevaya**, by Sadhguru and Sounds of Isha, is included as a reference to [the video you provided](https://www.youtube.com/watch?v=iUrjWDnyFCM).

It is explicitly marked **Needs an arrangement**. No audio is downloaded, and no unverified or copyrighted transcription is bundled.

To turn any reference into a playable lesson:

1. Obtain a single-note MIDI melody you have permission to use, or prepare your own permitted arrangement.
2. Open the reference and choose **Add an arrangement**.
3. Import the MIDI and choose its melody track, or enter the notes.
4. Save, listen to the demo, and start practicing.

A YouTube link contains neither a reliable note sequence nor fingering. Separating a full recording into instruments and making a suitable beginner arrangement is outside this version. The app does **not** promise that pasting a link will produce a lesson.

### Entering notes

```text
C4 D4 E4 G4:2 E4 D4 C4:2
```

- `C4` is middle C; `A4` is the 440 Hz tuning note.
- `F#4` and `Bb3` represent sharps and flats. Flats display as their sharp equivalents.
- `C4:2` lasts two beats; `D4:0.5` lasts half a beat.
- `R:1` is one beat of rest.
- Notes without a duration last one beat. Separate entries with spaces or commas.
- A song supports up to 512 steps, pitches A0-C8, and durations 1/64 to 64 beats. There can be up to 100 custom songs in addition to the exercises.

### MIDI import details

Standard MIDI format 0 and 1 files up to 2 MB are supported. PPQ timing is required; SMPTE timing and asynchronous format 2 files are rejected.

- Select one non-percussion track.
- For simultaneous note onsets, the **highest pitch** is kept.
- Overlapping notes are shortened at the next onset.
- Internal rests are preserved; leading silence is removed.
- The first tempo is used as the starting demo tempo, within the 30-240 BPM range.
- Sustain pedal, changing tempos, dynamics, fingering, meter, and multiple simultaneous notes are not imported.
- This is an explicitly labeled **monophonic simplification**, not a guarantee that the chosen track is the song's melody.
- Export a shorter section if a track exceeds the supported step/duration limits.

The notation is a pitch-oriented phrase preview, not a full engraved score: no inferred time signature or bar structure is added. Unusual imported durations are approximated visually; hovering a note shows its precise beat duration, and playback uses its duration. Extreme pitches are octave-shifted for display and labeled; piano keys and note names retain the actual octave. In practice, rests are skipped and duration is not graded.

## Microphone setup and limitations

1. Use a recent Chrome or Edge browser over HTTPS, or localhost for development.
2. Enable the microphone and allow the browser permission prompt.
3. Put the microphone near the piano in a quiet room.
4. Play **one clear note at a time**, without the sustain pedal or backing music.
5. Release the key between repeated notes. A held note cannot repeatedly advance the lesson.

All audio processing happens locally using Web Audio and a YIN pitch detector. The app does not record, upload, or store microphone audio. It requests that browser noise reduction, echo cancellation, and automatic gain be disabled, but some hardware may still apply processing.

Detection is **experimental**, roughly A1-A6, and works best in the middle register. Acoustic piano harmonics, chords, sustain, room noise, and microphone quality can cause errors. It is not polyphonic recognition, rhythm grading, or fingering analysis. MIDI **file import** is supported; connecting a piano via Web MIDI is not implemented.

The demo stops microphone practice to avoid the app recognizing its own audio. Note previews briefly suppress recognition for the same reason. Inputs pause during demos. Switching views, opening a dialog, hiding the tab, or completing a phrase stops the microphone and releases its tracks.

Synthetic pitch detection and simulated microphone flow have automated/browser coverage; performance with your physical instrument still needs a real-device check.

## Progress, privacy, and backups

Songs and progress live in `localStorage`, under the `cadence.piano.v1` key. They belong to the browser profile **and site origin**, not an account or a single device universally.

- Clearing site data or using an ephemeral private session can remove progress.
- Use **My progress > Export backup** to save songs and history.
- **Restore backup** validates the JSON, then asks before replacing the current library and history.
- If storage is blocked, full, or corrupt, a warning is shown. Practice can continue in memory, but export a backup before leaving.
- Invalid existing storage is not silently overwritten.
- YouTube references open YouTube externally. Nothing is embedded or contacted on page load.
- There are no analytics, external fonts, paid APIs, or server-side storage.

## Deploy free on GitHub Pages

1. Create a **public** GitHub repository and put this project's source in its `main` branch. Include the lockfile and `.github` workflow directory; do not upload `node_modules` or `dist`.
2. In the repository, open **Settings > Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Push a commit to `main`, or run **Deploy Cadence to GitHub Pages** from the **Actions** tab.
5. Wait for the build and deployment jobs to finish. Open the URL shown by the deployment, usually:

   ```text
   https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
   ```

The included [deployment workflow](.github/workflows/deploy.yml) installs locked dependencies, runs tests, builds, and publishes the static files. The production build uses relative asset URLs so repository subpaths work. GitHub Pages supplies HTTPS, which microphone access requires.

For this repository, use [Pages settings](https://github.com/vpallati/VishnuSimplyPiano/settings/pages) and follow deployment progress in [GitHub Actions](https://github.com/vpallati/VishnuSimplyPiano/actions/workflows/deploy.yml). Later pushes to `main` automatically test, rebuild, and update the site.

No repository credentials are needed for local use. You can also deploy the generated `dist` folder on another static HTTPS host.

## Development and checks

```powershell
npm test
npm run check
npm run build
npm run preview
```

- Browser-native JavaScript modules, with strict TypeScript/JSDoc checks.
- Plain CSS and inline SVG; no runtime framework or dependencies.
- Native Node tests cover note parsing, practice transitions, loops, pitch detection, MIDI parsing, validation, and persistence.
- Vite handles local serving and production asset bundling.
- [src/core.js](src/core.js): notes, pitch detection, note gating, and practice state.
- [src/midi.js](src/midi.js): bounded Standard MIDI parsing and melody extraction.
- [src/audio.js](src/audio.js): browser audio and microphone lifecycle.
- [src/storage.js](src/storage.js): versioned storage and validated backups.
- [src/main.js](src/main.js): interface and interaction.
- [src/visuals.js](src/visuals.js): notation, keyboard, and icons.

Before a release, also try permission denial, a disconnected microphone, a quiet real piano, repeated notes, demo cancellation, MIDI track selection, backup restoration, and a small phone viewport. Synthetic tests cannot reproduce every microphone or instrument.

## License

[MIT](LICENSE). The source code and Cadence-original exercises are freely usable and modifiable. Third-party song titles and external references are not claims of ownership or licenses to their music. Only import material you have permission to use. Cadence is not affiliated with Simply Piano, its owners, or the linked artists.
