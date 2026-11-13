import type { Plugin, PluginEvent, PluginHost } from '../plugin';

export interface SessionStats {
  hits: number;
  perfect: number;
  good: number;
  miss: number;
  wrong: number;
  maxCombo: number;
}

/**
 * Accumulates judging events into a running tally and logs a summary when a
 * practice run finishes. Demonstrates an event-only (no drawing) plugin.
 */
export class SessionStatsPlugin implements Plugin {
  readonly id = 'session-stats';
  readonly name = 'Session statistics';
  readonly version = '1.0.0';
  readonly description = 'Counts hits, misses and wrong notes; logs a summary at the end of a run.';

  private host: PluginHost | null = null;
  private combo = 0;
  stats: SessionStats = { hits: 0, perfect: 0, good: 0, miss: 0, wrong: 0, maxCombo: 0 };

  setup(host: PluginHost): void {
    this.host = host;
  }

  onEvent(event: PluginEvent): void {
    switch (event.type) {
      case 'note-hit':
        this.stats.hits++;
        if (event.judgement === 'perfect') this.stats.perfect++;
        else this.stats.good++;
        this.combo = event.combo;
        if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
        break;
      case 'note-miss':
        this.stats.miss++;
        this.combo = 0;
        break;
      case 'note-wrong':
        this.stats.wrong++;
        this.combo = 0;
        break;
      case 'score-reset':
        this.reset();
        break;
      case 'result':
        this.host?.log('[session-stats]', {
          ...this.stats,
          accuracy: event.result.accuracy,
          grade: event.result.grade,
        });
        break;
    }
  }

  reset(): void {
    this.stats = { hits: 0, perfect: 0, good: 0, miss: 0, wrong: 0, maxCombo: 0 };
    this.combo = 0;
  }
}
