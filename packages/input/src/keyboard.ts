import type { NoteHandlers } from './webmidi';

// Computer-keyboard -> semitone offset (piano-style row mapping).
const MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8,
  h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
};

export class ComputerKeyboardInput {
  private down = new Set<string>();
  private handlers: NoteHandlers;
  private baseMidi: number;

  constructor(handlers: NoteHandlers, baseMidi = 60) {
    this.handlers = handlers;
    this.baseMidi = baseMidi;
  }

  attach(): void {
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
  }

  detach(): void {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    this.down.clear();
  }

  private kd = (e: KeyboardEvent): void => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    const k = e.key.toLowerCase();
    const off = MAP[k];
    if (off === undefined || this.down.has(k)) return;
    this.down.add(k);
    this.handlers.onNoteOn(this.baseMidi + off, 0.8);
    e.preventDefault();
  };

  private ku = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    const off = MAP[k];
    if (off === undefined) return;
    this.down.delete(k);
    this.handlers.onNoteOff(this.baseMidi + off);
  };
}
