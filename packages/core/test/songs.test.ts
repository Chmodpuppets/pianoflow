import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseMidi, assignHands, songStats, type MidiSong } from '../src/index';

const songsDir = fileURLToPath(new URL('../../../apps/web/public/songs/', import.meta.url));
const manifest = JSON.parse(readFileSync(songsDir + 'songs.json', 'utf8')) as {
  id: string;
  title: string;
  file: string;
}[];

function load(file: string): MidiSong {
  const buf = readFileSync(songsDir + file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parseMidi(ab);
}

describe('bundled songs', () => {
  it('manifest lists twelve public-domain songs', () => {
    expect(manifest.length).toBe(12);
    expect(manifest.every((s) => s.id && s.title && s.file)).toBe(true);
  });

  for (const entry of manifest) {
    it(`parses ${entry.id} into a valid two-hand song`, () => {
      const song = load(entry.file);
      expect(song.format).toBe(1);
      expect(song.ppq).toBe(480);
      expect(song.notes.length).toBeGreaterThan(0);
      expect(song.duration).toBeGreaterThan(0);
      expect(song.tracks.length).toBe(2);
      expect(song.timeSignatures.length).toBeGreaterThan(0);
      assignHands(song.notes);
      expect(songStats(song).noteCount).toBe(song.notes.length);
      // Every note must have a sane pitch and positive duration.
      for (const n of song.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(21);
        expect(n.midi).toBeLessThanOrEqual(108);
        expect(n.duration).toBeGreaterThan(0);
      }
    });
  }

  it('encodes non-4/4 time signatures correctly', () => {
    const fur = load('fur-elise.mid');
    expect(fur.timeSignatures[0].numerator).toBe(3);
    expect(fur.timeSignatures[0].denominator).toBe(8);
    const hb = load('happy-birthday.mid');
    expect(hb.timeSignatures[0].numerator).toBe(3);
    expect(hb.timeSignatures[0].denominator).toBe(4);
    const gs = load('greensleeves.mid');
    expect(gs.timeSignatures[0].numerator).toBe(6);
    expect(gs.timeSignatures[0].denominator).toBe(8);
  });

  it('keeps Für Elise right and left hands aligned', () => {
    const song = load('fur-elise.mid');
    const end = (track: number) =>
      Math.max(...song.notes.filter((n) => n.track === track).map((n) => n.time + n.duration));
    expect(Math.abs(end(0) - end(1))).toBeLessThan(0.1);
  });

  it('encodes the new pieces with the right metres', () => {
    expect(load('amazing-grace.mid').timeSignatures[0]).toMatchObject({ numerator: 3, denominator: 4 });
    expect(load('scarborough-fair.mid').timeSignatures[0]).toMatchObject({ numerator: 3, denominator: 4 });
    expect(load('canon-in-d.mid').timeSignatures[0]).toMatchObject({ numerator: 4, denominator: 4 });
    expect(load('prelude-in-c.mid').timeSignatures[0]).toMatchObject({ numerator: 4, denominator: 4 });
    expect(load('when-the-saints.mid').timeSignatures[0]).toMatchObject({ numerator: 4, denominator: 4 });
  });

  it('renders the Bach prelude as a dense sixteenth-note arpeggio study', () => {
    const song = load('prelude-in-c.mid');
    const right = song.notes.filter((n) => n.track === 0);
    expect(right.length).toBe(144); // 9 bars x 16 sixteenths
    // Every right-hand note is a sixteenth (0.25 beat; ~0.208s at 72bpm).
    expect(right.every((n) => n.duration < 0.25)).toBe(true);
    assignHands(song.notes);
    expect(right.every((n) => n.hand === 'right')).toBe(true);
  });

  it('keeps Canon in D hands aligned and assigns melody to the right hand', () => {
    const song = load('canon-in-d.mid');
    assignHands(song.notes);
    const right = song.notes.filter((n) => n.hand === 'right');
    const left = song.notes.filter((n) => n.hand === 'left');
    expect(right.length).toBe(17);
    expect(left.length).toBe(9);
    // The melody sits above the bass.
    const avg = (ns: typeof right) => ns.reduce((s, n) => s + n.midi, 0) / ns.length;
    expect(avg(right)).toBeGreaterThan(avg(left));
  });
});

describe('imported user songs (format 0)', () => {
  it('user manifest lists the imported La La Land file', () => {
    const user = JSON.parse(readFileSync(songsDir + 'user.json', 'utf8')) as { id: string; file: string }[];
    expect(user.some((s) => s.id === 'la-la-land' && s.file === 'la-la-land.mid')).toBe(true);
  });

  it('parses a single-track format-0 MIDI and splits hands by pitch', () => {
    const song = load('la-la-land.mid');
    expect(song.format).toBe(0);
    expect(song.ppq).toBe(384);
    expect(song.tracks.length).toBe(1);
    expect(song.notes.length).toBeGreaterThan(0);
    expect(song.duration).toBeGreaterThan(0);
    assignHands(song.notes);
    const hands = new Set(song.notes.map((n) => n.hand));
    expect(hands.has('right')).toBe(true);
    expect(hands.has('left')).toBe(true);
    for (const n of song.notes) {
      expect(n.midi).toBeGreaterThanOrEqual(21);
      expect(n.midi).toBeLessThanOrEqual(108);
      expect(n.duration).toBeGreaterThan(0);
    }
  });
});
