export interface TempoPoint {
  ticks: number;
  bpm: number;
}

interface ResolvedPoint {
  ticks: number;
  bpm: number;
  /** seconds per tick */
  spt: number;
}

/**
 * Maps between MIDI ticks and wall-clock seconds using a tempo map.
 * Pure and dependency-free so it can be unit tested in Node.
 */
export class TempoMap {
  readonly ppq: number;
  private points: ResolvedPoint[];
  /** cumulative seconds at each point */
  private cum: number[];

  constructor(ppq: number, tempos: TempoPoint[]) {
    this.ppq = ppq;
    const sorted = [...tempos].sort((a, b) => a.ticks - b.ticks);
    const pts = sorted.length ? sorted : [{ ticks: 0, bpm: 120 }];
    if (pts[0].ticks > 0) pts.unshift({ ticks: 0, bpm: pts[0].bpm });
    this.points = pts.map((p) => ({ ticks: p.ticks, bpm: p.bpm, spt: 60 / p.bpm / ppq }));
    this.cum = [];
    let acc = 0;
    for (let i = 0; i < this.points.length; i++) {
      if (i > 0) {
        acc += (this.points[i].ticks - this.points[i - 1].ticks) * this.points[i - 1].spt;
      }
      this.cum.push(acc);
    }
  }

  private indexAt(ticks: number): number {
    let i = 0;
    for (let k = 0; k < this.points.length; k++) {
      if (this.points[k].ticks <= ticks) i = k;
      else break;
    }
    return i;
  }

  ticksToSeconds(ticks: number): number {
    const i = this.indexAt(ticks);
    return this.cum[i] + (ticks - this.points[i].ticks) * this.points[i].spt;
  }

  secondsToTicks(seconds: number): number {
    let i = 0;
    for (let k = 0; k < this.cum.length; k++) {
      if (this.cum[k] <= seconds) i = k;
      else break;
    }
    return this.points[i].ticks + (seconds - this.cum[i]) / this.points[i].spt;
  }

  bpmAt(ticks: number): number {
    return this.points[this.indexAt(ticks)].bpm;
  }
}
