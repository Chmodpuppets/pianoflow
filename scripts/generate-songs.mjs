// Zero-dependency Standard MIDI File writer.
// Generates public-domain practice songs (right hand ch0 + left hand ch1)
// into apps/web/public/songs/ plus a songs.json manifest.
//
// Melodies are simplified public-domain arrangements for practice. Each song
// may declare its own tempo (bpm), time signature, pickup (anacrusis) length
// and bass pattern, or supply an explicit left-hand part.
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

function noteTrack(name, channel, notes, withMeta, bpm = 120, timeSig = [4, 2]) {
  const events = [];
  if (withMeta) {
    events.push({ t: 0, data: metaText(0x03, name) });
    events.push({ t: 0, data: tempoMeta(Math.round(60000000 / bpm)) });
    events.push({ t: 0, data: timeSigMeta(timeSig[0], timeSig[1]) });
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

// melody: [midi, beats][] where beats are quarter-note units (0.5 = eighth,
// 0.25 = sixteenth). midi <= 0 is a rest that advances time without sounding.
function melodyToNotes(melody, vel = 92) {
  let t = 0;
  const notes = [];
  for (const [midi, beats] of melody) {
    const dur = Math.round(beats * PPQ);
    if (midi > 0) notes.push({ t, midi, dur, vel });
    t += dur;
  }
  return notes;
}

// Build the left hand either from an explicit melody (`left`) or from
// per-measure root notes (`roots`) shaped by a bass pattern. A pattern entry
// is [offsetBeats, durationBeats, velocity] within one measure.
function makeBass(s) {
  if (s.left) return melodyToNotes(s.left, 70);
  const mb = s.measureBeats ?? 4;
  const pickup = s.pickup ?? 0;
  const pat =
    s.bassPattern ??
    (mb === 4
      ? [[0, 2, 70], [2, 2, 58]] // oom-pah
      : mb === 3
        ? [[0, 1, 70], [1, 1, 55], [2, 1, 55]] // oom-pah-pah (waltz)
        : [[0, Math.max(1, mb - 0.2), 64]]); // sustained root
  const notes = [];
  (s.roots ?? []).forEach((root, i) => {
    if (root <= 0) return;
    for (const [off, dur, vel] of pat) {
      notes.push({ t: Math.round((pickup + i * mb + off) * PPQ), midi: root, dur: Math.round(dur * PPQ), vel });
    }
  });
  return notes;
}

// Pitch constants (scientific pitch notation, C4 = middle C = 60).
const C2 = 36, D2 = 38, E2 = 40, G2 = 43, A2 = 45;
const C3 = 48, D3 = 50, E3 = 52, F3 = 53, G3 = 55, A3 = 57;
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71;
const C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79;
const Fs4 = 66, Gs4 = 68, Ds5 = 75, Fs5 = 78;
const B2 = 47, F2 = 41, Fs2 = 42, B3 = 59, Cs5 = 73;

// --- Twinkle Twinkle Little Star (4/4) ---
const twinkleMelody = [
  [C4,1],[C4,1],[G4,1],[G4,1],[A4,1],[A4,1],[G4,2],
  [F4,1],[F4,1],[E4,1],[E4,1],[D4,1],[D4,1],[C4,2],
  [G4,1],[G4,1],[F4,1],[F4,1],[E4,1],[E4,1],[D4,2],
  [G4,1],[G4,1],[F4,1],[F4,1],[E4,1],[E4,1],[D4,2],
  [C4,1],[C4,1],[G4,1],[G4,1],[A4,1],[A4,1],[G4,2],
  [F4,1],[F4,1],[E4,1],[E4,1],[D4,1],[D4,1],[C4,2],
];
const twinkleRoots = [C3,C3,F3,C3,C3,G3,C3,G3,C3,C3,F3,C3];

// --- Ode to Joy (4/4) ---
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

// --- Für Elise (3/8, A minor) — opening A section ---
const furEliseMelody = [
  [E5,.25],[Ds5,.25],
  [E5,.25],[Ds5,.25],[E5,.25],[B4,.25],[D5,.25],[C5,.25],
  [A4,.5],[0,.25],[C4,.25],[E4,.25],[A4,.25],
  [B4,.5],[0,.25],[E4,.25],[Gs4,.25],[B4,.25],
  [C5,.5],[0,.25],[E4,.25],[E5,.25],[Ds5,.25],
  [E5,.25],[Ds5,.25],[E5,.25],[B4,.25],[D5,.25],[C5,.25],
  [A4,.5],[0,.25],[C4,.25],[E4,.25],[A4,.25],
  [B4,.5],[0,.25],[E4,.25],[C5,.25],[B4,.25],
  [A4,.5],[0,.25],[B4,.25],[C5,.25],[D5,.25],
  [E5,.25],[Ds5,.25],[E5,.25],[B4,.25],[D5,.25],[C5,.25],
  [A4,.5],[0,.25],[C4,.25],[E4,.25],[A4,.25],
  [B4,.5],[0,.25],[E4,.25],[Gs4,.25],[B4,.25],
  [C5,.5],[0,.25],[E4,.25],[E5,.25],[Ds5,.25],
  [E5,.25],[Ds5,.25],[E5,.25],[B4,.25],[D5,.25],[C5,.25],
  [A4,.5],[0,.25],[C4,.25],[E4,.25],[A4,.25],
  [B4,.5],[0,.25],[E4,.25],[C5,.25],[B4,.25],
  [A4,1.5],
];
const furEliseLeft = (() => {
  const am = [A2, E3, A3];
  const e = [E2, E3, Gs4 - 12]; // E2 E3 G#3
  const chords = [am,am,e,am, am,am,e,am, am,am,e,am, am,am,e]; // 15 bars
  const out = [[0, 0.5]]; // pickup rest
  for (const ch of chords) for (const m of ch) out.push([m, 0.5]);
  out.push([A2, 1.5]);
  return out;
})();

// --- Minuet in G (3/4, Petzold, formerly attr. Bach) ---
const minuetMelody = [
  [D5,1],[G4,.5],[A4,.5],[B4,.5],[C5,.5],
  [D5,1],[G4,1],[G4,1],
  [E5,1],[C5,.5],[D5,.5],[E5,.5],[Fs5,.5],
  [G5,1],[G4,1],[G4,1],
  [C5,1],[D5,.5],[C5,.5],[B4,.5],[A4,.5],
  [B4,1],[C5,.5],[B4,.5],[A4,.5],[G4,.5],
  [A4,1],[B4,.5],[A4,.5],[G4,.5],[Fs4,.5],
  [G4,2],[0,1],
];
const minuetRoots = [G2,G2,C3,G2,D3,G2,D3,G2];

// --- Greensleeves (6/8, A minor) ---
const greensleevesMelody = [
  [A4,0.5],
  [C5,1.5],[D5,0.5],[E5,1.5],[F5,0.5],
  [E5,1],[D5,0.5],[B4,1.5],[G4,0.5],
  [A4,1.5],[B4,0.5],[C5,1],[B4,0.5],
  [A4,1.5],[Fs4,0.5],[Gs4,1.5],[A4,0.5],
  [B4,1],[Gs4,0.5],[A4,1.5],[0,0.5],
];
const greensleevesRoots = [A2,E2,A2,E2,A2,E2,A2];

// --- Happy Birthday (3/4, C major) — melody now public domain ---
const happyBirthdayMelody = [
  [G4,.5],[G4,.5],
  [A4,1],[G4,1],[C5,1],
  [B4,2],[G4,.5],[G4,.5],
  [A4,1],[G4,1],[D5,1],
  [C5,2],[G4,.5],[G4,.5],
  [G5,1],[E5,1],[C5,1],
  [B4,1],[A4,2],
  [F5,.5],[F5,.5],
  [E5,1],[C5,1],[D5,1],
  [C5,2],[0,1],
];
const happyBirthdayRoots = [C3,G2,G2,C3,C3,C3,F3,C3,C3];

// --- London Bridge (4/4, C major) ---
const londonBridgeMelody = [
  [G4,1],[A4,1],[G4,1],[F4,1],
  [E4,1],[F4,1],[G4,2],
  [D4,1],[E4,1],[F4,2],
  [E4,1],[F4,1],[G4,2],
  [G4,1],[A4,1],[G4,1],[F4,1],
  [E4,1],[F4,1],[G4,2],
  [D4,1],[G4,1],[C4,2],
  [C4,2],[0,2],
];
const londonBridgeRoots = [C3,C3,G2,C3,C3,C3,G2,C3];

// --- Canon in D (4/4, Pachelbel) — the famous descending half-note theme ---
const canonMelody = [
  [Fs5,2],[E5,2],
  [D5,2],[Cs5,2],
  [B4,2],[A4,2],
  [B4,2],[Cs5,2],
  [D5,2],[Cs5,2],
  [B4,2],[A4,2],
  [G4,2],[Fs4,2],
  [G4,2],[A4,2],
  [D5,4],
];
const canonRoots = [D3,A2,B2,Fs2,G2,D3,G2,A2,D3];

// --- Prelude in C, BWV 846 (4/4, J.S. Bach) — broken-chord arpeggios ---
// Each bar is the iconic 16-sixteenth figure [a b c d e c d e] twice.
const bachBar = (shape) => {
  const [a, b, c, d, e] = shape;
  const fig = [a, b, c, d, e, c, d, e];
  return [...fig, ...fig].map((m) => [m, 0.25]);
};
const preludeMelody = [
  ...bachBar([C4,E4,G4,C5,E5]),
  ...bachBar([B3,D4,G4,B4,D5]),
  ...bachBar([A3,C4,E4,A4,C5]),
  ...bachBar([E3,G3,B3,E4,G4]),
  ...bachBar([F3,A3,C4,F4,A4]),
  ...bachBar([C4,E4,G4,C5,E5]),
  ...bachBar([F3,A3,C4,F4,A4]),
  ...bachBar([G3,B3,D4,G4,B4]),
  ...bachBar([C4,E4,G4,C5,E5]),
];
const preludeRoots = [C3,B2,A2,E2,F2,C3,F2,G2,C3];

// --- Amazing Grace (3/4, G major) — two phrases of the hymn ---
const amazingMelody = [
  [D4,1],
  [G4,2],[B4,1],
  [B4,2],[A4,1],
  [G4,2],[E4,1],
  [D4,2],[D4,1],
  [G4,2],[B4,1],
  [B4,2],[A4,1],
  [G4,3],
  [D5,2],[B4,1],
  [B4,2],[A4,1],
  [G4,2],[E4,1],
  [D4,2],[D4,1],
  [G4,2],[B4,1],
  [B4,2],[A4,1],
  [G4,3],
];
const amazingRoots = [G2,C3,G2,D3,G2,C3,G2, G2,C3,G2,D3,G2,C3,G2];

// --- When the Saints Go Marching In (4/4, C major) ---
const saintsMelody = [
  [C4,1],[E4,1],[F4,1],[G4,1],
  [C4,1],[E4,1],[F4,1],[G4,1],
  [C4,1],[E4,1],[F4,1],[G4,1],
  [E4,1],[C4,1],[E4,1],[D4,1],
  [C4,2],[E4,1],[C4,1],
  [D4,2],[0,2],
];
const saintsRoots = [C3,C3,C3,G2,C3,G2];

// --- Scarborough Fair (3/4, A Dorian) ---
const scarboroughMelody = [
  [A4,1],[A4,1],[E5,1],
  [E5,1.5],[D5,0.5],[C5,1],
  [D5,1],[E5,1],[C5,1],
  [A4,2],[0,1],
  [E5,1],[E5,1],[E5,1],
  [E5,1.5],[D5,0.5],[C5,1],
  [D5,1],[E5,1],[C5,1],
  [A4,2],[0,1],
];
const scarboroughRoots = [A2,G2,A2,E2, A2,G2,A2,A2];

const songs = [
  { id: 'twinkle', title: 'Twinkle Twinkle Little Star', composer: 'Traditional (Public Domain)', genre: 'Traditional', file: 'twinkle.mid', melody: twinkleMelody, roots: twinkleRoots },
  { id: 'ode-to-joy', title: 'Ode to Joy', composer: 'L. van Beethoven (Public Domain)', genre: 'Classical', file: 'ode-to-joy.mid', melody: odeMelody, roots: odeRoots },
  { id: 'london-bridge', title: 'London Bridge', composer: 'Traditional (Public Domain)', genre: 'Traditional', file: 'london-bridge.mid', melody: londonBridgeMelody, roots: londonBridgeRoots },
  { id: 'happy-birthday', title: 'Happy Birthday', composer: 'Traditional (Public Domain)', genre: 'Traditional', file: 'happy-birthday.mid', melody: happyBirthdayMelody, roots: happyBirthdayRoots, bpm: 110, timeSig: [3, 2], measureBeats: 3, pickup: 1 },
  { id: 'minuet-in-g', title: 'Minuet in G', composer: 'C. Petzold (Public Domain)', genre: 'Classical', file: 'minuet-in-g.mid', melody: minuetMelody, roots: minuetRoots, bpm: 110, timeSig: [3, 2], measureBeats: 3 },
  { id: 'greensleeves', title: 'Greensleeves', composer: 'Traditional (Public Domain)', genre: 'Folk', file: 'greensleeves.mid', melody: greensleevesMelody, roots: greensleevesRoots, bpm: 100, timeSig: [6, 3], measureBeats: 3, pickup: 0.5, bassPattern: [[0, 1.5, 66], [1.5, 1.5, 55]] },
  { id: 'fur-elise', title: 'Für Elise', composer: 'L. van Beethoven (Public Domain)', genre: 'Classical', file: 'fur-elise.mid', melody: furEliseMelody, left: furEliseLeft, bpm: 100, timeSig: [3, 3], measureBeats: 1.5, pickup: 0.5 },
  { id: 'canon-in-d', title: 'Canon in D', composer: 'J. Pachelbel (Public Domain)', genre: 'Classical', file: 'canon-in-d.mid', melody: canonMelody, roots: canonRoots, bpm: 72, bassPattern: [[0, 3.9, 62]] },
  { id: 'prelude-in-c', title: 'Prelude in C (BWV 846)', composer: 'J.S. Bach (Public Domain)', genre: 'Classical', file: 'prelude-in-c.mid', melody: preludeMelody, roots: preludeRoots, bpm: 72, bassPattern: [[0, 3.9, 60]] },
  { id: 'amazing-grace', title: 'Amazing Grace', composer: 'Traditional (Public Domain)', genre: 'Traditional', file: 'amazing-grace.mid', melody: amazingMelody, roots: amazingRoots, bpm: 80, timeSig: [3, 2], measureBeats: 3, pickup: 1 },
  { id: 'when-the-saints', title: 'When the Saints Go Marching In', composer: 'Traditional (Public Domain)', genre: 'Traditional', file: 'when-the-saints.mid', melody: saintsMelody, roots: saintsRoots, bpm: 120 },
  { id: 'scarborough-fair', title: 'Scarborough Fair', composer: 'Traditional (Public Domain)', genre: 'Folk', file: 'scarborough-fair.mid', melody: scarboroughMelody, roots: scarboroughRoots, bpm: 90, timeSig: [3, 2], measureBeats: 3 },
];

const manifest = [];
for (const s of songs) {
  const right = melodyToNotes(s.melody, 92);
  const left = makeBass(s);
  const tracks = [
    noteTrack(s.title + ' (Right)', 0, right, true, s.bpm ?? 120, s.timeSig ?? [4, 2]),
    noteTrack(s.title + ' (Left)', 1, left, false),
  ];
  const buf = buildMidi(tracks);
  writeFileSync(join(outDir, s.file), buf);
  manifest.push({ id: s.id, title: s.title, composer: s.composer, genre: s.genre, file: s.file });
  console.log(`wrote ${s.file} (${buf.length} bytes, ${right.length} right / ${left.length} left notes)`);
}
writeFileSync(join(outDir, 'songs.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote songs.json');
