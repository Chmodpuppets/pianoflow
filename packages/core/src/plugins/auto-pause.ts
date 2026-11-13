import type { Plugin, PluginEvent, PluginHost } from '../plugin';

export interface AutoPauseOptions {
  /** consecutive mistakes that trigger a pause (default 3) */
  threshold?: number;
}

/**
 * Pauses playback after a run of consecutive mistakes, giving the player a
 * chance to regroup. Demonstrates a plugin that controls the host transport.
 * Disabled by default so it never surprises the player.
 */
export class AutoPausePlugin implements Plugin {
  readonly id = 'auto-pause';
  readonly name = 'Auto-pause on mistakes';
  readonly version = '1.0.0';
  readonly description = 'Pauses playback after several consecutive misses so you can regroup.';
  readonly defaultEnabled = false;

  private host: PluginHost | null = null;
  private streak = 0;
  private threshold: number;

  constructor(opts: AutoPauseOptions = {}) {
    this.threshold = Math.max(1, Math.floor(opts.threshold ?? 3));
  }

  setup(host: PluginHost): void {
    this.host = host;
  }

  onEvent(event: PluginEvent): void {
    switch (event.type) {
      case 'note-hit':
        this.streak = 0;
        break;
      case 'note-miss':
      case 'note-wrong':
        this.streak++;
        if (this.streak >= this.threshold && this.host?.playing) {
          this.host.pause();
          this.host.log('[auto-pause] paused after', this.streak, 'consecutive mistakes');
          this.streak = 0;
        }
        break;
      case 'score-reset':
        this.streak = 0;
        break;
    }
  }

  /** current consecutive-mistake streak (for tests / UI) */
  get mistakes(): number {
    return this.streak;
  }
}
