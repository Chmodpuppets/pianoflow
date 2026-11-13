import { describe, it, expect } from 'vitest';
import { INSTRUMENTS, DEFAULT_INSTRUMENT, isInstrument, instrumentLabel, instrumentFile } from '../src/instruments';

describe('instruments', () => {
  it('exposes a non-empty palette including the default piano', () => {
    expect(INSTRUMENTS.length).toBeGreaterThanOrEqual(4);
    expect(isInstrument(DEFAULT_INSTRUMENT)).toBe(true);
    expect(INSTRUMENTS[0].id).toBe(DEFAULT_INSTRUMENT);
  });

  it('every entry has a unique id, label and desc', () => {
    const ids = new Set(INSTRUMENTS.map((i) => i.id));
    expect(ids.size).toBe(INSTRUMENTS.length);
    for (const i of INSTRUMENTS) {
      expect(i.label.length).toBeGreaterThan(0);
      expect(i.desc.length).toBeGreaterThan(0);
    }
  });

  it('isInstrument rejects unknown ids', () => {
    expect(isInstrument('not_a_real_instrument')).toBe(false);
    expect(isInstrument('')).toBe(false);
  });

  it('instrumentLabel falls back to the id for unknown instruments', () => {
    expect(instrumentLabel('music_box')).toBe('Music Box');
    expect(instrumentLabel('unknown')).toBe('unknown');
  });

  it('instrumentFile builds the bundled mp3-js filename', () => {
    expect(instrumentFile('acoustic_grand_piano')).toBe('acoustic_grand_piano-mp3.js');
    expect(instrumentFile('vibraphone')).toBe('vibraphone-mp3.js');
  });
});
