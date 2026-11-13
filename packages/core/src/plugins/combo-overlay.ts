import type { Plugin, PluginEvent, DrawSurface, FrameInfo } from '../plugin';

type Judgement = 'perfect' | 'good' | 'miss' | 'wrong';

const FLASH_SECONDS = 0.5;

/**
 * Draws a live combo counter and a fading judgement flash on the playfield.
 * Demonstrates an overlay plugin using the DrawSurface. Only reacts to practice
 * judging events, so it stays invisible in listen mode.
 */
export class ComboOverlayPlugin implements Plugin {
  readonly id = 'combo-overlay';
  readonly name = 'Combo overlay';
  readonly version = '1.0.0';
  readonly description = 'Draws a live combo counter and judgement flash on the playfield.';

  private combo = 0;
  private last: Judgement | null = null;
  private flash = 0;

  onEvent(event: PluginEvent): void {
    switch (event.type) {
      case 'note-hit':
        this.combo = event.combo;
        this.last = event.judgement;
        this.flash = FLASH_SECONDS;
        break;
      case 'note-miss':
        this.combo = 0;
        this.last = 'miss';
        this.flash = FLASH_SECONDS;
        break;
      case 'note-wrong':
        this.combo = 0;
        this.last = 'wrong';
        this.flash = FLASH_SECONDS;
        break;
      case 'score-reset':
        this.combo = 0;
        this.last = null;
        this.flash = 0;
        break;
    }
  }

  onDraw(surface: DrawSurface, frame: FrameInfo): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - frame.dt);
    if (this.combo < 2 && this.flash <= 0) return;

    const cx = frame.width / 2;
    surface.save();
    surface.setTextAlign('center');

    if (this.combo >= 2) {
      const tier = this.combo >= 50 ? '#ff5db1' : this.combo >= 20 ? '#ffd166' : '#4ea1ff';
      // A brief pop right after a hit makes the counter feel responsive.
      const pop = this.flash > FLASH_SECONDS - 0.12 ? 32 : 28;
      surface.setGlobalAlpha(0.92);
      surface.setFillStyle(tier);
      surface.setFont(`bold ${pop}px sans-serif`);
      surface.fillText(`${this.combo} COMBO`, cx, 46);
    }

    if (this.last && this.flash > 0) {
      const color =
        this.last === 'perfect' ? '#59d98e' : this.last === 'good' ? '#4ea1ff' : '#ff6b6b';
      surface.setGlobalAlpha(Math.min(1, this.flash / FLASH_SECONDS) * 0.95);
      surface.setFillStyle(color);
      surface.setFont('bold 18px sans-serif');
      surface.fillText(this.last.toUpperCase(), cx, 74);
    }

    surface.restore();
    surface.setGlobalAlpha(1);
  }
}
