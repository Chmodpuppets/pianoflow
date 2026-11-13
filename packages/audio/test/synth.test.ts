import { describe, it, expect } from 'vitest';
import { PianoSynth } from '../src/synth';

// Minimal Web Audio mock: records every gain node and what it connects to,
// so we can assert the synth's output routing without a real AudioContext.
interface MockGain {
  gain: {
    value: number;
    setValueAtTime: () => void;
    exponentialRampToValueAtTime: () => void;
    cancelScheduledValues: () => void;
    setTargetAtTime: () => void;
  };
  connect: (dest: unknown) => void;
  dest?: unknown;
}
function mockAudioCtx() {
  const gains: MockGain[] = [];
  const destination = { __destination: true };
  const ctx = {
    currentTime: 0,
    destination,
    createGain: (): MockGain => {
      const node: MockGain = {
        gain: {
          value: 1,
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
          cancelScheduledValues: () => {},
          setTargetAtTime: () => {},
        },
        connect: (dest: unknown) => {
          node.dest = dest;
        },
      };
      gains.push(node);
      return node;
    },
    createOscillator: () => ({
      type: 'sine',
      frequency: { value: 0 },
      connect: () => {},
      start: () => {},
      stop: () => {},
      onended: null as null | (() => void),
    }),
  };
  return { ctx, gains, destination };
}

describe('PianoSynth output routing (master-mute support)', () => {
  it('connects to ctx.destination by default', () => {
    const { ctx, gains, destination } = mockAudioCtx();
    new PianoSynth(ctx as unknown as AudioContext);
    expect(gains[0].dest).toBe(destination);
    expect(gains[0].gain.value).toBe(0.5);
  });

  it('connects to a provided destination bus when given one', () => {
    const { ctx, gains } = mockAudioCtx();
    const bus = { __masterGain: true };
    new PianoSynth(ctx as unknown as AudioContext, bus as unknown as AudioNode);
    expect(gains[0].dest).toBe(bus);
  });

  it('routes each played note through the synth master gain', () => {
    const { ctx, gains } = mockAudioCtx();
    const bus = { __masterGain: true };
    const synth = new PianoSynth(ctx as unknown as AudioContext, bus as unknown as AudioNode);
    const master = gains[0];
    synth.play(60, 0, 0.5, 0.8);
    // The note envelope gain (second created) must feed the master, not the destination.
    expect(gains[1].dest).toBe(master);
    expect(master.dest).toBe(bus);
  });
});
