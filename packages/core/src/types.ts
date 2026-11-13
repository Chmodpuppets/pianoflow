export type Hand = 'left' | 'right';

export interface MidiNote {
  /** MIDI pitch 0-127 */
  midi: number;
  /** start position in ticks */
  ticks: number;
  /** duration in ticks */
  durationTicks: number;
  /** start position in seconds (tempo-map resolved) */
  time: number;
  /** duration in seconds */
  duration: number;
  /** normalized velocity 0-1 */
  velocity: number;
  channel: number;
  track: number;
  hand?: Hand;
}

export interface TempoEvent {
  ticks: number;
  bpm: number;
  time: number;
}

export interface TimeSignature {
  ticks: number;
  numerator: number;
  denominator: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  channel: number;
  noteCount: number;
}

export interface MidiSong {
  name: string;
  format: number;
  ppq: number;
  durationTicks: number;
  duration: number;
  notes: MidiNote[];
  tempos: TempoEvent[];
  timeSignatures: TimeSignature[];
  tracks: TrackInfo[];
}
