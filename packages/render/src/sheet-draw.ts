import { TREBLE_BOTTOM, BASS_BOTTOM, type SheetNote, type NoteValue, type KeySignature, type Staff } from '@pianoflow/core';
import type { Theme } from './theme';

/**
 * Shared grand-staff drawing primitives used by both the scrolling SheetRenderer
 * and the static SheetPageRenderer. Pure canvas drawing (a 2D context is passed
 * in) so the notation visuals stay consistent across the live view and the
 * printable full-score export, and can be exercised headlessly with a mock ctx.
 */

export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function ledger(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, s: number, steps: number): void {
  const ly = y + (steps - s) * (gap / 2);
  ctx.beginPath();
  ctx.moveTo(x - gap * 0.95, ly);
  ctx.lineTo(x + gap * 0.95, ly);
  ctx.stroke();
}

/**
 * Draw a single note (ledger lines, accidental, stem, flags, notehead) centred at
 * (x, y). `near` adds a glow when the note is at the play cursor (live view only).
 */
export interface BeamInfo {
  dir: 'up' | 'down';
  /** y the stem must reach (the interpolated primary-beam line at this x) */
  stemEndY: number;
}

export function drawSheetNote(
  ctx: CanvasRenderingContext2D,
  n: SheetNote,
  x: number,
  y: number,
  gap: number,
  theme: Theme,
  near = false,
  beam?: BeamInfo,
): void {
  const color = n.hand === 'left' ? theme.leftNote : theme.rightNote;
  const rx = gap * 0.62;
  const ry = gap * 0.46;
  const filled = n.value === 'quarter' || n.value === 'eighth' || n.value === 'sixteenth';

  // Ledger lines for notes beyond the staff (steps 0..8 are the five lines).
  ctx.strokeStyle = withAlpha(theme.text, 0.4);
  ctx.lineWidth = 1;
  for (let s = -2; s >= n.steps; s -= 2) ledger(ctx, x, y, gap, s, n.steps);
  for (let s = 10; s <= n.steps; s += 2) ledger(ctx, x, y, gap, s, n.steps);

  // Accidental (1 sharp, −1 flat, 2 natural cancelling the key signature).
  if (n.accidental !== 0) {
    const glyph = n.accidental === 2 ? '♮' : n.accidental > 0 ? '♯' : '♭';
    ctx.fillStyle = withAlpha(theme.text, 0.85);
    ctx.font = `${Math.round(gap * 1.7)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x - rx * 2.1, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Stem (whole notes have none). Beamed notes follow the group direction and
  // reach the beam line instead of carrying individual flags.
  if (n.value !== 'whole') {
    const down = beam ? beam.dir === 'down' : n.steps >= 4;
    const sx = down ? x - rx * 0.9 : x + rx * 0.9;
    const len = gap * 3.2;
    const endY = beam ? beam.stemEndY : down ? y + len : y - len;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, gap * 0.16);
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx, endY);
    ctx.stroke();
    const flags = beam ? 0 : n.value === 'eighth' ? 1 : n.value === 'sixteenth' ? 2 : 0;
    for (let f = 0; f < flags; f++) {
      const fy = endY + (down ? -1 : 1) * f * gap * 0.7;
      ctx.beginPath();
      ctx.moveTo(sx, fy);
      ctx.quadraticCurveTo(sx + gap * 1.1, fy + (down ? -1 : 1) * gap * 0.5, sx + gap * 0.7, fy + (down ? -1 : 1) * gap * 1.2);
      ctx.stroke();
    }
  }

  // Notehead.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.32);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = color;
    if (near) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }
    ctx.fill();
  } else {
    ctx.lineWidth = Math.max(1.4, gap * 0.2);
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.restore();
  ctx.shadowBlur = 0;
}

/** Stylised treble clef: a vertical spiral centred on the G line (steps 2). */
export function drawTrebleClef(ctx: CanvasRenderingContext2D, x: number, bottom: number, gap: number, theme: Theme): void {
  const u = gap;
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.text, 0.8);
  ctx.fillStyle = withAlpha(theme.text, 0.8);
  ctx.lineWidth = Math.max(1.6, u * 0.28);
  ctx.lineCap = 'round';
  const gY = bottom - u; // G4 line = bottom - gap
  ctx.beginPath();
  ctx.moveTo(x + u * 0.2, bottom + u * 1.6);
  ctx.bezierCurveTo(x - u * 1.3, bottom + u * 0.4, x - u * 0.9, gY - u * 1.6, x + u * 0.1, gY - u * 1.7);
  ctx.bezierCurveTo(x + u * 1.2, gY - u * 1.6, x + u * 1.2, gY - u * 0.2, x + u * 0.1, gY);
  ctx.bezierCurveTo(x - u * 0.9, gY + u * 0.2, x - u * 0.9, gY + u * 1.2, x + u * 0.1, gY + u * 1.2);
  ctx.bezierCurveTo(x + u * 0.8, gY + u * 1.2, x + u * 0.8, gY + u * 0.4, x + u * 0.1, gY + u * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + u * 0.2, bottom + u * 1.6, u * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Stylised bass clef: a curve plus two dots framing the F line (steps 6). */
export function drawBassClef(ctx: CanvasRenderingContext2D, x: number, bottom: number, gap: number, theme: Theme): void {
  const u = gap;
  const fY = bottom - 3 * u; // F3 line = bottom - 3*gap
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.text, 0.8);
  ctx.fillStyle = withAlpha(theme.text, 0.8);
  ctx.lineWidth = Math.max(1.6, u * 0.28);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - u * 0.6, fY + u * 0.2);
  ctx.bezierCurveTo(x + u * 0.2, fY - u * 1.4, x + u * 1.5, fY - u * 0.6, x + u * 1.1, fY + u * 0.6);
  ctx.bezierCurveTo(x + u * 0.8, fY + u * 1.6, x - u * 0.2, fY + u * 2.2, x - u * 0.7, fY + u * 2.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - u * 0.5, fY + u * 0.1, u * 0.3, 0, Math.PI * 2);
  ctx.fill();
  for (const dy of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.arc(x + u * 1.7, fY + dy * u, u * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Conventional key-signature glyph positions (absolute diatonic index, C4 = 28),
 * indexed by mark order. Treble sharps F#5 C#5 G#5 D#5 A#4 E#5 B#4; flats mirror.
 */
const TREBLE_SHARP_IDX = [38, 35, 39, 36, 33, 37, 34];
const TREBLE_FLAT_IDX = [34, 37, 33, 36, 32, 35, 31];
const BASS_SHARP_IDX = [24, 21, 25, 22, 19, 23, 20];
const BASS_FLAT_IDX = [20, 23, 19, 22, 18, 21, 17];

/** Horizontal space a key signature occupies after the clef (0 when none). */
export function keySignatureWidth(sig: KeySignature | undefined, gap: number): number {
  if (!sig || sig.marks.length === 0) return 0;
  return sig.marks.length * gap * 0.95 + gap * 0.6;
}

/**
 * Draw a key signature's sharps/flats at their conventional staff positions,
 * starting at x (just right of the clef). `bottom` is the staff's bottom-line y.
 */
export function drawKeySignature(
  ctx: CanvasRenderingContext2D,
  sig: KeySignature | undefined,
  staff: Staff,
  x: number,
  bottom: number,
  gap: number,
  theme: Theme,
): void {
  if (!sig || sig.marks.length === 0) return;
  const idx = staff === 'treble'
    ? (sig.fifths >= 0 ? TREBLE_SHARP_IDX : TREBLE_FLAT_IDX)
    : (sig.fifths >= 0 ? BASS_SHARP_IDX : BASS_FLAT_IDX);
  const staffBottom = staff === 'treble' ? TREBLE_BOTTOM : BASS_BOTTOM;
  const spacing = gap * 0.95;
  ctx.fillStyle = withAlpha(theme.text, 0.85);
  ctx.font = `${Math.round(gap * 1.7)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  sig.marks.forEach((m, i) => {
    const di = idx[i] ?? idx[idx.length - 1];
    const y = bottom - (di - staffBottom) * (gap / 2);
    ctx.fillText(m.accidental > 0 ? '♯' : '♭', x + i * spacing + spacing / 2, y);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** A note's position within a beam group (notehead centre + rhythmic value). */
export interface BeamPoint {
  x: number;
  y: number;
  value: NoteValue;
}

export interface BeamGeometry {
  dir: 'up' | 'down';
  /** stem end y for each point (on the primary beam line) */
  ends: number[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** +1 when stems point down (beam below heads), -1 when up */
  sy: number;
  beamSep: number;
}

/**
 * Compute a (near-horizontal) primary beam through a group's stem ends. The slope
 * is clamped so beams stay readable; every stem is extended to the beam line.
 */
export function beamGeometry(points: BeamPoint[], gap: number, dir: 'up' | 'down'): BeamGeometry | null {
  if (points.length < 2) return null;
  const stemLen = gap * 3.2;
  const sy = dir === 'down' ? 1 : -1;
  const first = points[0];
  const last = points[points.length - 1];
  const y0 = first.y + sy * stemLen;
  const rawDy = last.y + sy * stemLen - y0;
  const maxDy = gap * 2;
  const dy = Math.max(-maxDy, Math.min(maxDy, rawDy));
  const span = last.x - first.x;
  const ends = points.map((p) => (span > 1e-6 ? y0 + dy * ((p.x - first.x) / span) : y0));
  return { dir, ends, x0: first.x, y0, x1: last.x, y1: y0 + dy, sy, beamSep: gap * 0.7 };
}

/** Draw the primary beam plus secondary beams/stubs for sixteenth notes. */
export function drawBeamLines(
  ctx: CanvasRenderingContext2D,
  points: BeamPoint[],
  geom: BeamGeometry,
  color: string,
  gap: number,
): void {
  const primaryY = (x: number): number => {
    const span = geom.x1 - geom.x0;
    return span > 1e-6 ? geom.y0 + (geom.y1 - geom.y0) * ((x - geom.x0) / span) : geom.y0;
  };
  ctx.strokeStyle = color;
  ctx.lineCap = 'butt';
  // Primary beam.
  ctx.lineWidth = Math.max(2, gap * 0.5);
  ctx.beginPath();
  ctx.moveTo(geom.x0, geom.y0);
  ctx.lineTo(geom.x1, geom.y1);
  ctx.stroke();
  // Secondary beam (sixteenths), offset toward the noteheads.
  const off = -geom.sy * geom.beamSep;
  ctx.lineWidth = Math.max(1.6, gap * 0.34);
  let i = 0;
  while (i < points.length) {
    if (points[i].value !== 'sixteenth') { i++; continue; }
    let j = i;
    while (j + 1 < points.length && points[j + 1].value === 'sixteenth') j++;
    if (j > i) {
      ctx.beginPath();
      ctx.moveTo(points[i].x, primaryY(points[i].x) + off);
      ctx.lineTo(points[j].x, primaryY(points[j].x) + off);
      ctx.stroke();
    } else {
      // Isolated sixteenth: a short stub toward its neighbour.
      const nx = i + 1 < points.length ? points[i + 1].x : points[i - 1].x;
      const dirSign = nx >= points[i].x ? 1 : -1;
      const sx = points[i].x;
      const ex = sx + dirSign * gap * 0.9;
      ctx.beginPath();
      ctx.moveTo(sx, primaryY(sx) + off);
      ctx.lineTo(ex, primaryY(ex) + off);
      ctx.stroke();
    }
    i = j + 1;
  }
}

/**
 * Draw a rest centred on the staff's middle line at (x, middleY). Whole/half rests
 * are the conventional filled blocks (whole hangs below the line above middle, half
 * sits on the middle line); quarter/eighth are stylised vector glyphs consistent
 * with the app's vector clefs. Pure canvas drawing; headless-testable.
 */
export function drawRest(
  ctx: CanvasRenderingContext2D,
  value: NoteValue,
  x: number,
  middleY: number,
  gap: number,
  theme: Theme,
): void {
  const ink = withAlpha(theme.text, 0.9);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  const w = gap * 1.3;
  const h = gap * 0.5;
  if (value === 'whole') {
    // Hangs below the line one above middle.
    ctx.fillRect(x - w / 2, middleY - gap, w, h);
    return;
  }
  if (value === 'half') {
    // Sits on top of the middle line.
    ctx.fillRect(x - w / 2, middleY - h, w, h);
    return;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (value === 'eighth' || value === 'sixteenth') {
    // A dot + a slanted stem with a hook (stylised eighth rest).
    ctx.beginPath();
    ctx.arc(x - gap * 0.28, middleY - gap * 0.55, gap * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.6, gap * 0.22);
    ctx.beginPath();
    ctx.moveTo(x + gap * 0.42, middleY - gap * 0.95);
    ctx.bezierCurveTo(
      x + gap * 0.1, middleY - gap * 0.2,
      x + gap * 0.05, middleY + gap * 0.3,
      x - gap * 0.35, middleY + gap * 0.95,
    );
    ctx.stroke();
    if (value === 'sixteenth') {
      ctx.beginPath();
      ctx.arc(x - gap * 0.05, middleY - gap * 0.15, gap * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // Quarter rest: the characteristic squiggle (stylised).
  ctx.lineWidth = Math.max(1.8, gap * 0.26);
  ctx.beginPath();
  ctx.moveTo(x + gap * 0.34, middleY - gap * 1.05);
  ctx.bezierCurveTo(
    x - gap * 0.18, middleY - gap * 0.62,
    x + gap * 0.5, middleY - gap * 0.34,
    x + gap * 0.02, middleY + gap * 0.02,
  );
  ctx.bezierCurveTo(
    x - gap * 0.5, middleY + gap * 0.36,
    x + gap * 0.42, middleY + gap * 0.56,
    x - gap * 0.12, middleY + gap * 1.02,
  );
  ctx.stroke();
}

/**
 * Draw a tie between two same-pitch noteheads at (x1,y1) and (x2,y2). The curve
 * arches away from the stem direction (`dir` = stem direction). Uses a cubic Bézier
 * so it never collides with the beam-flag quadratic counter. Pure canvas drawing.
 */
export function drawTie(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dir: 'up' | 'down',
  gap: number,
  color: string,
): void {
  const rx = gap * 0.5;
  const ax = x1 + rx;
  const bx = x2 - rx;
  if (bx <= ax) return;
  const arch = (dir === 'up' ? 1 : -1) * gap * 0.9;
  const my = (y1 + y2) / 2 + arch;
  ctx.strokeStyle = withAlpha(color, 0.85);
  ctx.lineWidth = Math.max(1.4, gap * 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, y1);
  ctx.bezierCurveTo(ax + (bx - ax) * 0.3, my, bx - (bx - ax) * 0.3, my, bx, y2);
  ctx.stroke();
}
