import { describe, it, expect } from 'vitest';
import { Transport } from '../src/transport';

describe('Transport', () => {
  it('advances by speed and stops at duration', () => {
    const t = new Transport(2);
    t.play();
    t.tick(0.5);
    expect(t.position).toBeCloseTo(0.5);
    t.setSpeed(2);
    t.tick(0.5);
    expect(t.position).toBeCloseTo(1.5);
    t.tick(1);
    expect(t.position).toBe(2);
    expect(t.playing).toBe(false);
  });
  it('seek clamps and stop resets', () => {
    const t = new Transport(3);
    t.seek(10);
    expect(t.position).toBe(3);
    t.seek(-1);
    expect(t.position).toBe(0);
    t.play();
    t.tick(1);
    t.stop();
    expect(t.position).toBe(0);
    expect(t.playing).toBe(false);
  });
  it('pause freezes position', () => {
    const t = new Transport(5);
    t.play();
    t.tick(1);
    t.pause();
    t.tick(1);
    expect(t.position).toBeCloseTo(1);
  });
});

describe('Transport loop', () => {
  it('wraps to loopStart when reaching loopEnd', () => {
    const t = new Transport(10);
    t.setLoop(2, 4);
    t.seek(2);
    t.play();
    t.tick(1.5);
    expect(t.position).toBeCloseTo(3.5);
    t.tick(1); // crosses 4 -> wraps to 2
    expect(t.position).toBeCloseTo(2);
    expect(t.playing).toBe(true);
  });
  it('ignores an invalid region and can be cleared', () => {
    const t = new Transport(10);
    t.setLoop(5, 5);
    expect(t.loopEnabled).toBe(false);
    t.setLoop(1, 3);
    expect(t.loopEnabled).toBe(true);
    t.clearLoop();
    expect(t.loopEnabled).toBe(false);
    expect(t.loopStart).toBeNull();
    t.play();
    t.tick(20);
    expect(t.position).toBe(10);
    expect(t.playing).toBe(false);
  });
  it('setLoopEnabled requires a defined region', () => {
    const t = new Transport(10);
    t.setLoopEnabled(true);
    expect(t.loopEnabled).toBe(false);
    t.setLoop(1, 3);
    t.setLoopEnabled(false);
    expect(t.loopEnabled).toBe(false);
    t.setLoopEnabled(true);
    expect(t.loopEnabled).toBe(true);
  });
});
