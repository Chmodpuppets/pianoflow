export interface Theme {
  background: string;
  whiteKey: string;
  blackKey: string;
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
  whiteKey: '#f4f4f5',
  blackKey: '#1b1b1f',
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
