/** A performed note in seconds (velocity 0..1). */
export interface WriteNote {
  midi: number;
  start: number;
  end: number;
  velocity: number;
}

export interface WriteOptions {
  ppq?: number;
  bpm?: number;
  trackName?: string;
}

function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const out = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return out;
}

function str(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0) & 0xff);
}

/**
 * Serialize performed notes to a Standard MIDI File (format 0, single track).
 * Zero-dependency; the inverse of the parser for round-tripping recordings.
 */
export function writeMidi(notes: WriteNote[], opts: WriteOptions = {}): Uint8Array {
  const ppq = opts.ppq ?? 480;
  const bpm = opts.bpm ?? 120;
  const ticksPerSec = (bpm / 60) * ppq;
  const toTick = (sec: number) => Math.max(0, Math.round(sec * ticksPerSec));

  interface Ev { tick: number; data: number[]; order: number }
  const events: Ev[] = [];
  // Tempo meta at tick 0.
  const usq = Math.round(60_000_000 / bpm);
  events.push({ tick: 0, data: [0xff, 0x51, 0x03, (usq >> 16) & 0xff, (usq >> 8) & 0xff, usq & 0xff], order: 0 });
  if (opts.trackName) {
    const name = str(opts.trackName);
    events.push({ tick: 0, data: [0xff, 0x03, ...vlq(name.length), ...name], order: 0 });
  }
  notes.forEach((n, i) => {
    const midi = Math.max(0, Math.min(127, Math.round(n.midi)));
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
    const on = toTick(n.start);
    const off = Math.max(on + 1, toTick(n.end));
    events.push({ tick: on, data: [0x90, midi, vel], order: 1 + i * 2 });
    events.push({ tick: off, data: [0x80, midi, 0], order: 2 + i * 2 });
  });
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  let last = 0;
  for (const ev of events) {
    track.push(...vlq(ev.tick - last), ...ev.data);
    last = ev.tick;
  }
  track.push(...vlq(0), 0xff, 0x2f, 0x00); // end of track

  const header = [
    ...str('MThd'), 0, 0, 0, 6,
    0, 0, // format 0
    0, 1, // one track
    (ppq >> 8) & 0xff, ppq & 0xff,
  ];
  const len = track.length;
  const chunk = [...str('MTrk'), (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...track];
  return new Uint8Array([...header, ...chunk]);
}
