import { copyFile, cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'public', 'transcription');
const pitch = join(root, 'node_modules', '@spotify', 'basic-pitch');
await mkdir(output, { recursive: true });
await cp(join(pitch, 'model'), join(output, 'model'), { recursive: true });
await copyFile(join(pitch, 'LICENSE'), join(output, 'BASIC-PITCH-LICENSE.txt'));
for (const [target, ...source] of [
  ['TONEJS-MIDI-LICENSE.txt', '@tonejs', 'midi', 'LICENSE.md'],
  ['ARRAY-FLATTEN-LICENSE.txt', 'array-flatten', 'LICENSE'],
  ['LONG-LICENSE.txt', 'long', 'LICENSE'],
  ['MIDI-FILE-LICENSE.txt', 'midi-file', 'LICENSE.md'],
  ['SEEDRANDOM-README.txt', 'seedrandom', 'README.md']
]) {
  await copyFile(join(root, 'node_modules', ...source), join(output, target));
}
