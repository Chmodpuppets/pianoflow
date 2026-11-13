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
  it('manifest lists seven public-domain songs', () => {
    expect(manifest.length).toBe(7);
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
});
