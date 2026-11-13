/** The bundled / selectable General MIDI timbres. */
export interface InstrumentDef {
  id: string;
  label: string;
  /** short blurb shown in the picker */
  desc: string;
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: 'acoustic_grand_piano', label: 'Grand Piano', desc: 'Warm concert grand (default)' },
  { id: 'electric_piano_1', label: 'Electric Piano', desc: 'Soft Rhodes-style e-piano' },
  { id: 'music_box', label: 'Music Box', desc: 'Bright, bell-like plucks' },
  { id: 'vibraphone', label: 'Vibraphone', desc: 'Mellow metal bars with shimmer' },
];

export const DEFAULT_INSTRUMENT = 'acoustic_grand_piano';

export function isInstrument(id: string): boolean {
  return INSTRUMENTS.some((i) => i.id === id);
}

export function instrumentLabel(id: string): string {
  return INSTRUMENTS.find((i) => i.id === id)?.label ?? id;
}

/** Filename of the bundled midi-js-soundfonts file for an instrument. */
export function instrumentFile(id: string): string {
  return `${id}-mp3.js`;
}
