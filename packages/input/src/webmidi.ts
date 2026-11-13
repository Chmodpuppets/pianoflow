export interface NoteHandlers {
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
}

/**
 * USB MIDI input via the Web MIDI API.
 * Supported in Chrome/Edge/Opera; Firefox is gated; Safari has no support.
 * Typed loosely to avoid relying on WebMIDI lib.dom typings.
 */
export class WebMidiInput {
  private access: any = null;
  private handlers: NoteHandlers;

  constructor(handlers: NoteHandlers) {
    this.handlers = handlers;
  }

  get supported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).requestMIDIAccess;
  }

  async init(): Promise<boolean> {
    if (!this.supported) return false;
    try {
      this.access = await (navigator as any).requestMIDIAccess({ sysex: false });
      this.attach();
      this.access.onstatechange = () => this.attach();
      return true;
    } catch {
      return false;
    }
  }

  private attach(): void {
    if (!this.access) return;
    this.access.inputs.forEach((inp: any) => {
      inp.onmidimessage = (e: any) => this.onMessage(e);
    });
  }

  private onMessage(e: any): void {
    const d = e.data;
    if (!d || d.length < 2) return;
    const status = d[0] & 0xf0;
    const midi = d[1];
    const vel = d.length > 2 ? d[2] : 0;
    if (status === 0x90 && vel > 0) this.handlers.onNoteOn(midi, vel / 127);
    else if (status === 0x80 || (status === 0x90 && vel === 0)) this.handlers.onNoteOff(midi);
  }

  dispose(): void {
    if (this.access) {
      this.access.inputs.forEach((i: any) => {
        i.onmidimessage = null;
      });
    }
  }
}
