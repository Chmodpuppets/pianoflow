// Zero-dependency Standard MIDI File writer.
// Generates two public-domain practice songs (right hand ch0 + left hand ch1)
// into apps/web/public/songs/ plus a songs.json manifest.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'apps', 'web', 'public', 'songs');
mkdirSync(outDir, { recursive: true });

const PPQ = 480;

const u16 = (n) => [(n >>> 8) & 0xff, n & 0xff];
const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function vlq(n) {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

const metaText = (type, text) => {
  const b = [...Buffer.from(text, 'utf8')];
  return [0xff, type, ...vlq(b.length), ...b];
};
const tempoMeta = (us) => [0xff, 0x51, 0x03, (us >>> 16) & 0xff, (us >>> 8) & 0xff, us & 0xff];
const timeSigMeta = (num, denPow) => [0xff, 0x58, 0x04, num, denPow, 24, 8];
const programChange = (ch, prog) => [0xc0 | ch, prog];
const noteOn = (ch, midi, vel) => [0x90 | ch, midi, vel];
const noteOff = (ch, midi) => [0x80 | ch, midi, 0x40];

function track(events) {
  const body = [];
  for (const e of events) body.push(...vlq(e.delta), ...e.data);
  body.push(0x00, 0xff, 0x2f, 0x00); // end of track
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body];
}

function buildMidi(tracks) {
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, ...u16(1), ...u16(tracks.length), ...u16(PPQ)];
  const out = [...header];
  for (const t of tracks) out.push(...t);
  return Buffer.from(out);
}

function noteTrack(name, channel, notes, withMeta) {
  const events = [];
  if (withMeta) {
    events.push({ t: 0, data: metaText(0x03, name) });
    events.push({ t: 0, data: tempoMeta(500000) }); // 120 bpm
    events.push({ t: 0, data: timeSigMeta(4, 2) }); // 4/4
  }
  events.push({ t: 0, data: programChange(channel, 0) });
  for (const n of notes) {
    events.push({ t: n.t, data: noteOn(channel, n.midi, n.vel ?? 90) });
    events.push({ t: n.t + n.dur, data: noteOff(channel, n.midi) });
  }
  events.sort((a, b) => a.t - b.t);
  let prev = 0;
  const evs = events.map((e) => {
    const delta = e.t - prev;
    prev = e.t;
    return { delta, data: e.data };
  });
  return track(evs);
}

function melodyToNotes(melody) {
  let t = 0;
  const notes = [];
  for (const [midi, beats] of melody) {
    const dur = Math.round(beats * PPQ);
    if (midi > 0) notes.push({ t, midi, dur, vel: 92 });
    t += dur;
  }
  return notes;
}

function bassNotes(roots, measureBeats = 4) {
  const notes = [];
  roots.forEach((root, i) => {
    if (root <= 0) return;
    notes.push({ t: i * measureBeats * PPQ, midi: root, dur: 2 * PPQ, vel: 70 });
    notes.push({ t: (i * measureBeats + 2) * PPQ, midi: root, dur: 2 * PPQ, vel: 58 });
  });
  return notes;
}

const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69;
const C3 = 48, F3 = 53, G3 = 55;

const twinkleMelody = [
  [C4,1],[C4,1],[G4,1],[G4,1],[A4,1],[A4,1],[G4,2],
  [F4,1],[F4,1],[E4,1],[E4,1],[D4,1],[D4,1],[C4,2],
  [G4,1],[G4,1],[F4,1],[F4,1],[E4,1],[E4,1],[D4,2],
  [G4,1],[G4,1],[F4,1],[F4,1],[E4,1],[E4,1],[D4,2],
  [C4,1],[C4,1],[G4,1],[G4,1],[A4,1],[A4,1],[G4,2],
  [F4,1],[F4,1],[E4,1],[E4,1],[D4,1],[D4,1],[C4,2],
];
const twinkleRoots = [C3,C3,F3,C3,C3,G3,C3,G3,C3,C3,F3,C3];

const odeMelody = [
  [E4,1],[E4,1],[F4,1],[G4,1],
  [G4,1],[F4,1],[E4,1],[D4,1],
  [C4,1],[C4,1],[D4,1],[E4,1],
  [E4,1.5],[D4,0.5],[D4,2],
  [E4,1],[E4,1],[F4,1],[G4,1],
  [G4,1],[F4,1],[E4,1],[D4,1],
  [C4,1],[C4,1],[D4,1],[E4,1],
  [D4,1.5],[C4,0.5],[C4,2],
];
const odeRoots = [C3,G3,C3,C3,C3,G3,C3,C3];

const songs = [
  {
    id: 'twinkle',
    title: 'Twinkle Twinkle Little Star',
    composer: 'Traditional (Public Domain)',
    file: 'twinkle.mid',
    melody: twinkleMelody,
    roots: twinkleRoots,
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    composer: 'L. van Beethoven (Public Domain)',
    file: 'ode-to-joy.mid',
    melody: odeMelody,
    roots: odeRoots,
  },
];

const manifest = [];
for (const s of songs) {
  const right = melodyToNotes(s.melody);
  const left = bassNotes(s.roots);
  const tracks = [
    noteTrack(s.title + ' (Right)', 0, right, true),
    noteTrack(s.title + ' (Left)', 1, left, false),
  ];
  const buf = buildMidi(tracks);
  writeFileSync(join(outDir, s.file), buf);
  manifest.push({ id: s.id, title: s.title, composer: s.composer, file: s.file });
  console.log(`wrote ${s.file} (${buf.length} bytes, ${right.length} right / ${left.length} left notes)`);
}
writeFileSync(join(outDir, 'songs.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote songs.json');
