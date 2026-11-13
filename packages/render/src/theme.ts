export interface Theme {
  background: string;
  /** vertical stage-background gradient (top → bottom) */
  bgTop: string;
  bgBottom: string;
  /** ambient wash glowing up from the strike line */
  stageGlow: string;
  whiteKey: string;
  /** bottom of the white-key gradient (top is `whiteKey`) */
  whiteKeyBottom: string;
  blackKey: string;
  /** top of the black-key gradient (bottom is `blackKey`) */
  blackKeyTop: string;
  keyPressed: string;
  rightNote: string;
  leftNote: string;
  hitLine: string;
  text: string;
  loopMarker: string;
  /** color of the note-name labels drawn on falling notes */
  noteLabel: string;
}

export const defaultTheme: Theme = {
  background: '#0f1220',
  bgTop: '#171e38',
  bgBottom: '#0a0d18',
  stageGlow: '#4ea1ff',
  whiteKey: '#f4f4f5',
  whiteKeyBottom: '#d6d6de',
  blackKey: '#1b1b1f',
  blackKeyTop: '#303038',
  keyPressed: '#ffd166',
  rightNote: '#4ea1ff',
  leftNote: '#59d98e',
  hitLine: '#ffffff',
  text: '#e6e6e6',
  loopMarker: '#ffd166',
  noteLabel: '#ffffff',
};

export const colorblindTheme: Theme = {
  ...defaultTheme,
  rightNote: '#0072B2',
  leftNote: '#E69F00',
  keyPressed: '#F0E442',
  loopMarker: '#CC79A7',
};
