import type { SheetNote } from '@pianoflow/core';
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
export function drawSheetNote(
  ctx: CanvasRenderingContext2D,
  n: SheetNote,
  x: number,
  y: number,
  gap: number,
  theme: Theme,
  near = false,
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

  // Accidental.
  if (n.accidental !== 0) {
    ctx.fillStyle = withAlpha(theme.text, 0.85);
    ctx.font = `${Math.round(gap * 1.7)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.accidental > 0 ? '♯' : '♭', x - rx * 2.1, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Stem (whole notes have none). Direction: down when high on the staff.
  if (n.value !== 'whole') {
    const down = n.steps >= 4;
    const sx = down ? x - rx * 0.9 : x + rx * 0.9;
    const len = gap * 3.2;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, gap * 0.16);
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx, down ? y + len : y - len);
    ctx.stroke();
    const flags = n.value === 'eighth' ? 1 : n.value === 'sixteenth' ? 2 : 0;
    for (let f = 0; f < flags; f++) {
      const fy = (down ? y + len : y - len) + (down ? -1 : 1) * f * gap * 0.7;
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
