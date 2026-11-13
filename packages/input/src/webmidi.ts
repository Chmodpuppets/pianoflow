export interface NoteHandlers {
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

/**
 * USB MIDI input via the Web MIDI API.
 * Supported in Chrome/Edge/Opera; Firefox is gated; Safari has no support.
 * Typed loosely to avoid relying on WebMIDI lib.dom typings.
 *
 * By default every connected input is listened to. `select(id)` narrows input
 * to a single device (or `null` for all). Device hot-plug and note activity are
 * surfaced through optional callbacks so a UI can render a device map.
 */
export class WebMidiInput {
  private access: any = null;
  private handlers: NoteHandlers;
  private selectedId: string | null = null;

  /** Fired whenever the set of input devices changes (hot-plug / state). */
  onDevicesChange?: (devices: MidiDeviceInfo[]) => void;
  /** Fired on each note-on, for a live activity monitor. */
  onActivity?: (midi: number, velocity: number) => void;

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
      this.access.onstatechange = () => {
        this.attach();
        this.onDevicesChange?.(this.devices());
      };
      this.onDevicesChange?.(this.devices());
      return true;
    } catch {
      return false;
    }
  }

  /** Snapshot of the currently connected input devices. */
  devices(): MidiDeviceInfo[] {
    if (!this.access) return [];
    const out: MidiDeviceInfo[] = [];
    this.access.inputs.forEach((inp: any) => {
      out.push({
        id: String(inp.id),
        name: inp.name || 'MIDI device',
        manufacturer: inp.manufacturer || '',
        state: inp.state || 'connected',
      });
    });
    return out;
  }

  /** Listen to a single device by id, or `null` to listen to all devices. */
  select(id: string | null): void {
    this.selectedId = id;
    this.attach();
  }

  get selected(): string | null {
    return this.selectedId;
  }

  private attach(): void {
    if (!this.access) return;
    this.access.inputs.forEach((inp: any) => {
      const active = this.selectedId == null || String(inp.id) === this.selectedId;
      inp.onmidimessage = active ? (e: any) => this.onMessage(e) : null;
    });
  }

  private onMessage(e: any): void {
    const d = e.data;
    if (!d || d.length < 2) return;
    const status = d[0] & 0xf0;
    const midi = d[1];
    const vel = d.length > 2 ? d[2] : 0;
    if (status === 0x90 && vel > 0) {
      this.handlers.onNoteOn(midi, vel / 127);
      this.onActivity?.(midi, vel / 127);
    } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
      this.handlers.onNoteOff(midi);
    }
  }

  dispose(): void {
    if (this.access) {
      this.access.inputs.forEach((i: any) => {
        i.onmidimessage = null;
      });
      this.access.onstatechange = null;
    }
  }
}
