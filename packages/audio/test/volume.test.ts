import { describe, it, expect } from 'vitest';
import { clamp01, masterGainValue } from '../src/volume';

describe('clamp01', () => {
  it('clamps to [0,1] and rejects non-finite', () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
  });
});

describe('masterGainValue (mute + volume interaction)', () => {
  it('mute always wins regardless of volume', () => {
    expect(masterGainValue(true, 1)).toBe(0);
    expect(masterGainValue(true, 0.5)).toBe(0);
  });
  it('unmuted gain equals clamped volume', () => {
    expect(masterGainValue(false, 0.9)).toBe(0.9);
    expect(masterGainValue(false, 0)).toBe(0);
    expect(masterGainValue(false, 5)).toBe(1);
    expect(masterGainValue(false, -3)).toBe(0);
  });
});
