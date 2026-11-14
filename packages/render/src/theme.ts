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
  /** color of the scrolling measure/beat rhythm grid behind the notes */
  grid: string;
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
  grid: '#8fa3c8',
};

export const colorblindTheme: Theme = {
  ...defaultTheme,
  rightNote: '#0072B2',
  leftNote: '#E69F00',
  keyPressed: '#F0E442',
  loopMarker: '#CC79A7',
};

/** Light "paper" palette for the printable full-score export (dark ink on white). */
export const paperTheme: Theme = {
  ...defaultTheme,
  background: '#ffffff',
  bgTop: '#ffffff',
  bgBottom: '#f4f5f8',
  stageGlow: '#2f6fd0',
  text: '#20242e',
  rightNote: '#2f6fd0',
  leftNote: '#1f8a55',
  hitLine: '#c9a227',
  grid: '#9aa3c0',
  noteLabel: '#20242e',
};
