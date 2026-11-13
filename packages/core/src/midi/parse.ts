import type { MidiSong, MidiNote, TempoEvent, TimeSignature, TrackInfo } from '../types';
import { TempoMap } from '../tempo';

interface RawNote {
  midi: number;
  startTick: number;
  endTick: number;
  velocity: number;
  channel: number;
  track: number;
}

/**
 * Parse a standard MIDI file (format 0/1, PPQ division) into a normalized MidiSong.
 * Zero dependencies; works in Node and the browser (ArrayBuffer input).
 */
export function parseMidi(buffer: ArrayBuffer): MidiSong {
  const data = new DataView(buffer);
  let pos = 0;

  const readU8 = () => data.getUint8(pos++);
  const readU16 = () => {
    const v = data.getUint16(pos);
    pos += 2;
    return v;
  };
  const readU32 = () => {
    const v = data.getUint32(pos);
    pos += 4;
    return v;
  };
  const readStr = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(data.getUint8(pos++));
    return s;
  };
  const readVLQ = () => {
    let v = 0;
    let b: number;
    do {
      b = readU8();
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };

  if (readStr(4) !== 'MThd') throw new Error('Not a MIDI file (missing MThd header)');
  const headerLen = readU32();
  const format = readU16();
  const numTracks = readU16();
  const division = readU16();
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  const ppq = division || 480;
  pos = 8 + headerLen;

  const tempos: { ticks: number; bpm: number }[] = [];
  const timeSignatures: TimeSignature[] = [];
  const tracks: TrackInfo[] = [];
  const rawNotes: RawNote[] = [];
  let maxTick = 0;
  let songName = '';

  for (let t = 0; t < numTracks; t++) {
    if (pos + 8 > data.byteLength) break;
    const chunkType = readStr(4);
    const chunkLen = readU32();
    const chunkEnd = pos + chunkLen;
    if (chunkType !== 'MTrk') {
      pos = chunkEnd;
      continue;
    }

    let tick = 0;
    let runningStatus = 0;
    let name = '';
    let channel = -1;
    let noteCount = 0;
    const open = new Map<string, { startTick: number; velocity: number }[]>();

    const pushNote = (key: string, startTick: number, endTick: number, velocity: number) => {
      const [chStr, midiStr] = key.split(':');
      rawNotes.push({
        midi: +midiStr,
        startTick,
        endTick: Math.max(endTick, startTick + 1),
        velocity,
        channel: +chStr,
        track: t,
      });
      noteCount++;
    };
    const closeNote = (key: string, endTick: number) => {
      const arr = open.get(key);
      if (!arr || arr.length === 0) return;
      const o = arr.shift()!;
      pushNote(key, o.startTick, endTick, o.velocity);
    };

    while (pos < chunkEnd) {
      const delta = readVLQ();
      tick += delta;
      let status = readU8();
      if (status < 0x80) {
        pos--;
        status = runningStatus;
      } else {
        runningStatus = status;
      }
      const type = status & 0xf0;
      const ch = status & 0x0f;

      if (status === 0xff) {
        const metaType = readU8();
        const len = readVLQ();
        const metaStart = pos;
        if (metaType === 0x51 && len === 3) {
          const us = (data.getUint8(pos) << 16) | (data.getUint8(pos + 1) << 8) | data.getUint8(pos + 2);
          tempos.push({ ticks: tick, bpm: 60000000 / us });
        } else if (metaType === 0x58 && len >= 4) {
          timeSignatures.push({
            ticks: tick,
            numerator: data.getUint8(pos),
            denominator: Math.pow(2, data.getUint8(pos + 1)),
          });
        } else if (metaType === 0x03) {
          let s = '';
          for (let i = 0; i < len; i++) s += String.fromCharCode(data.getUint8(pos + i));
          name = s;
          if (!songName) songName = s;
        }
        pos = metaStart + len;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVLQ();
        pos += len;
      } else if (type === 0x90) {
        const midi = readU8();
        const vel = readU8();
        channel = ch;
        const key = ch + ':' + midi;
        if (vel > 0) {
          const arr = open.get(key) ?? [];
          arr.push({ startTick: tick, velocity: vel / 127 });
          open.set(key, arr);
        } else {
          closeNote(key, tick);
        }
      } else if (type === 0x80) {
        const midi = readU8();
        readU8();
        closeNote(ch + ':' + midi, tick);
      } else if (type === 0xb0) {
        readU8();
        readU8();
      } else if (type === 0xc0 || type === 0xd0) {
        readU8();
      } else if (type === 0xe0) {
        readU8();
        readU8();
      } else {
        pos = chunkEnd;
        break;
      }
      if (tick > maxTick) maxTick = tick;
    }

    for (const [key, arr] of open) {
      for (const o of arr) pushNote(key, o.startTick, tick, o.velocity);
    }
    pos = chunkEnd;
    tracks.push({ index: t, name, channel, noteCount });
  }

  const tempoMap = new TempoMap(ppq, tempos);
  const notes: MidiNote[] = rawNotes
    .map((n) => {
      const time = tempoMap.ticksToSeconds(n.startTick);
      const end = tempoMap.ticksToSeconds(n.endTick);
      return {
        midi: n.midi,
        ticks: n.startTick,
        durationTicks: n.endTick - n.startTick,
        time,
        duration: Math.max(end - time, 0.01),
        velocity: n.velocity,
        channel: n.channel,
        track: n.track,
      };
    })
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  for (const n of rawNotes) if (n.endTick > maxTick) maxTick = n.endTick;

  const tempoEvents: TempoEvent[] = tempos
    .sort((a, b) => a.ticks - b.ticks)
    .map((tp) => ({ ticks: tp.ticks, bpm: tp.bpm, time: tempoMap.ticksToSeconds(tp.ticks) }));
  if (tempoEvents.length === 0) tempoEvents.push({ ticks: 0, bpm: 120, time: 0 });
  if (timeSignatures.length === 0) timeSignatures.push({ ticks: 0, numerator: 4, denominator: 4 });
  timeSignatures.sort((a, b) => a.ticks - b.ticks);

  return {
    name: songName || 'Untitled',
    format,
    ppq,
    durationTicks: maxTick,
    duration: tempoMap.ticksToSeconds(maxTick),
    notes,
    tempos: tempoEvents,
    timeSignatures,
    tracks,
  };
}
