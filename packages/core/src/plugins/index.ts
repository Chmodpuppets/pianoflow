import type { Plugin } from '../plugin';
import { SessionStatsPlugin } from './session-stats';
import { AutoPausePlugin } from './auto-pause';
import { ComboOverlayPlugin } from './combo-overlay';
import { PracticeHudPlugin } from './practice-hud';
import { TempoTrainerPlugin } from './tempo-trainer';

export * from './session-stats';
export * from './auto-pause';
export * from './combo-overlay';
export * from './practice-hud';
export * from './tempo-trainer';

/** The plugins bundled with PianoFlow. */
export function createBuiltinPlugins(): Plugin[] {
  return [
    new SessionStatsPlugin(),
    new AutoPausePlugin(),
    new ComboOverlayPlugin(),
    new PracticeHudPlugin(),
    new TempoTrainerPlugin(),
  ];
}
