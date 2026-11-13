import type { NoteHandlers } from './webmidi';

/** Mouse / multi-touch input on the virtual keyboard. */
export class PointerInput {
  private active = new Map<number, number>();
  private canvas: HTMLCanvasElement;
  private handlers: NoteHandlers;
  private hitTest: (x: number, y: number) => number | null;

  constructor(
    canvas: HTMLCanvasElement,
    handlers: NoteHandlers,
    hitTest: (x: number, y: number) => number | null,
  ) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.hitTest = hitTest;
  }

  attach(): void {
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', this.pd);
    this.canvas.addEventListener('pointerup', this.pu);
    this.canvas.addEventListener('pointercancel', this.pu);
    this.canvas.addEventListener('pointerleave', this.pu);
  }

  detach(): void {
    this.canvas.removeEventListener('pointerdown', this.pd);
    this.canvas.removeEventListener('pointerup', this.pu);
    this.canvas.removeEventListener('pointercancel', this.pu);
    this.canvas.removeEventListener('pointerleave', this.pu);
    this.active.clear();
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pd = (e: PointerEvent): void => {
    const { x, y } = this.local(e);
    const midi = this.hitTest(x, y);
    if (midi == null) return;
    this.active.set(e.pointerId, midi);
    this.handlers.onNoteOn(midi, 0.8);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    e.preventDefault();
  };

  private pu = (e: PointerEvent): void => {
    const midi = this.active.get(e.pointerId);
    if (midi == null) return;
    this.active.delete(e.pointerId);
    this.handlers.onNoteOff(midi);
  };
}
