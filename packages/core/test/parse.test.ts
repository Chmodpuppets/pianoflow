import { describe, it, expect } from 'vitest';
import { parseMidi } from '../src/midi/parse';

function vlq(n: number): number[] {
  const b = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    b.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return b;
}
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u32 = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const u16 = (n: number) => [(n >> 8) & 255, n & 255];

function buildMidi(): ArrayBuffer {
  const ppq = 480;
  const ev: number[] = [];
  ev.push(...vlq(0), 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20); // tempo 500000us = 120bpm
  ev.push(...vlq(0), 0x90, 60, 100); // C4 on
  ev.push(...vlq(480), 0x80, 60, 0); // C4 off
  ev.push(...vlq(0), 0x90, 64, 100); // E4 on
  ev.push(...vlq(480), 0x80, 64, 0); // E4 off
  ev.push(...vlq(0), 0xff, 0x2f, 0x00); // end of track
  const track = [...str('MTrk'), ...u32(ev.length), ...ev];
  const header = [...str('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(ppq)];
  return new Uint8Array([...header, ...track]).buffer;
}

describe('parseMidi', () => {
  it('parses notes, tempo and duration', () => {
    const song = parseMidi(buildMidi());
    expect(song.ppq).toBe(480);
    expect(song.notes).toHaveLength(2);
    expect(song.notes[0].midi).toBe(60);
    expect(song.notes[0].time).toBeCloseTo(0);
    expect(song.notes[0].duration).toBeCloseTo(0.5);
    expect(song.notes[1].midi).toBe(64);
    expect(song.notes[1].time).toBeCloseTo(0.5);
    expect(song.duration).toBeCloseTo(1.0);
    expect(song.tempos[0].bpm).toBeCloseTo(120);
  });
  it('rejects non-MIDI data', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4]).buffer)).toThrow();
  });
});
