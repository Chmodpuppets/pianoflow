import type { Plugin, PluginEvent, PluginHost, DrawSurface, FrameInfo } from '../plugin';

/**
 * A heads-up display for practice: a live accuracy readout plus a song-progress
 * bar. Event-driven (no geometry needed), so it draws at fixed screen positions
 * and is fully testable headless. Demonstrates a drawing plugin that combines
 * several event types.
 */
export class PracticeHudPlugin implements Plugin {
  readonly id = 'practice-hud';
  readonly name = 'Practice HUD';
  readonly version = '1.0.0';
  readonly description = 'Live accuracy percentage and a song-progress bar at the top of the playfield.';
  readonly defaultEnabled = false;

  private host: PluginHost | null = null;
  private hits = 0;
  private judged = 0;

  setup(host: PluginHost): void {
    this.host = host;
  }

  onEvent(event: PluginEvent): void {
    switch (event.type) {
      case 'note-hit':
        this.hits++;
        this.judged++;
        break;
      case 'note-miss':
      case 'note-wrong':
        this.judged++;
        break;
      case 'score-reset':
        this.hits = 0;
        this.judged = 0;
        break;
    }
  }

  /** Current accuracy as a 0..1 fraction (0 when nothing has been judged yet). */
  get accuracy(): number {
    return this.judged > 0 ? this.hits / this.judged : 0;
  }

  onDraw(surface: DrawSurface, frame: FrameInfo): void {
    const song = this.host?.song;
    if (!song || song.duration <= 0) return;

    surface.save();
    // Progress bar across the very top of the playfield.
    const progress = Math.max(0, Math.min(1, frame.position / song.duration));
    surface.setGlobalAlpha(0.22);
    surface.setFillStyle('#ffffff');
    surface.fillRect(0, 0, frame.width, 3);
    surface.setGlobalAlpha(0.95);
    surface.setFillStyle('#4ea1ff');
    surface.fillRect(0, 0, frame.width * progress, 3);

    // Accuracy readout (only once something has been judged).
    if (this.judged > 0) {
      const pct = Math.round(this.accuracy * 100);
      surface.setGlobalAlpha(0.92);
      surface.setFillStyle('#e6e6e6');
      surface.setFont('bold 13px sans-serif');
      surface.setTextAlign('left');
      surface.fillText(`Accuracy ${pct}%`, 12, 24);
    }
    surface.restore();
    surface.setGlobalAlpha(1);
  }
}
