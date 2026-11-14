// GPU-accelerated falling-note renderer.
//
// The Canvas2D renderer rasterizes every visible note (rounded rect + vertical
// gradient + soft bloom) on the CPU. For dense "black MIDI" files (tens of
// thousands of notes) that fill cost dominates the frame. This backend draws the
// same notes on the GPU with a single instanced draw call: one unit quad, one
// per-instance buffer, and a fragment shader that reproduces the rounded-rect
// shape, the screen-space vertical gradient and the luminous bloom.
//
// It targets WebGL 1.0 + ANGLE_instanced_arrays (universally supported, including
// the headless-gl rasterizer used by the visual-QA harness) and renders into an
// OFFSCREEN canvas with a transparent background. The Canvas2D renderer composites
// that canvas into the scene at the exact layer the notes occupy (above the
// backdrop, below the strike line / keyboard / labels), so every other visual —
// keyboard, hit line, particles, plugins — is unchanged. When WebGL is unavailable
// the renderer falls back to its batched Canvas2D path.

import type { MidiNote } from '@pianoflow/core';
import type { KeyboardLayout } from './keyboard';
import type { Theme } from './theme';

/** Pixels of bloom margin added around each glowing note (matches shadowBlur≈12). */
export const NOTE_GLOW_MARGIN = 12;
/** Floats per instance: rect(4) + color(4) + misc(4: radius, glow, keyboardTop, margin). */
export const INSTANCE_FLOATS = 12;
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

export interface NoteScene {
  /** Notes already narrowed to the visible time window (viewport-culled). */
  notes: MidiNote[];
  layout: KeyboardLayout;
  /** Pixels per second of falling speed. */
  pps: number;
  /** Current playback position in seconds. */
  position: number;
  keyboardTop: number;
  cssH: number;
  theme: Theme;
  dimHand?: 'left' | 'right';
}

export interface NoteInstances {
  data: Float32Array;
  count: number;
}

/** Parse a #rrggbb color into normalized [r,g,b] (0..1). */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Build the per-instance buffer for the visible notes. Pure and headless-testable:
 * the inner rect (x, y, w, h, radius) is computed exactly like the Canvas2D cull so
 * the GPU output lands on the same pixels. Glowing notes are expanded by a bloom
 * margin; muted (assisted-hand) notes are flat, dimmer, and have no bloom.
 */
export function buildNoteInstances(scene: NoteScene): NoteInstances {
  const { notes, layout, pps, position, keyboardTop, cssH, theme, dimHand } = scene;
  const right = hexToRgb(theme.rightNote);
  const left = hexToRgb(theme.leftNote);
  const data = new Float32Array(notes.length * INSTANCE_FLOATS);
  let o = 0;
  let count = 0;
  for (const n of notes) {
    const bottom = keyboardTop - (n.time - position) * pps;
    const top = bottom - n.duration * pps;
    if (top > cssH || bottom < 0) continue;
    const key = layout.byMidi.get(n.midi);
    if (!key) continue;
    const x = key.x + 1;
    const w = key.width - 2;
    const y = Math.max(top, -10);
    const h = Math.min(bottom, keyboardTop) - y;
    if (h <= 0 || w <= 0) continue;
    const dim = dimHand != null && n.hand === dimHand;
    const rgb = dim
      ? (dimHand === 'left' ? left : right)
      : (n.hand === 'left' ? left : right);
    const alpha = dim ? 0.3 : 1;
    const glow = dim ? 0 : 1;
    const margin = dim ? 0 : NOTE_GLOW_MARGIN;
    const radius = Math.min(4, w / 2);
    data[o++] = x - margin;
    data[o++] = y - margin;
    data[o++] = w + margin * 2;
    data[o++] = h + margin * 2;
    data[o++] = rgb[0];
    data[o++] = rgb[1];
    data[o++] = rgb[2];
    data[o++] = alpha;
    data[o++] = radius;
    data[o++] = glow;
    data[o++] = keyboardTop;
    data[o++] = margin;
    count++;
  }
  return { data: count === notes.length ? data : data.subarray(0, count * INSTANCE_FLOATS), count };
}

const VERT = `
attribute vec2 a_unit;
attribute vec4 a_rect;
attribute vec4 a_color;
attribute vec4 a_misc;
uniform vec2 u_resolution;
varying vec2 v_local;
varying vec2 v_size;
varying vec4 v_color;
varying vec4 v_misc;
varying float v_screenY;
void main() {
  vec2 pos = a_rect.xy + a_unit * a_rect.zw;
  v_local = a_unit * a_rect.zw;
  v_size = a_rect.zw;
  v_color = a_color;
  v_misc = a_misc;
  v_screenY = pos.y;
  vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_local;
varying vec2 v_size;
varying vec4 v_color;
varying vec4 v_misc;
varying float v_screenY;
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
void main() {
  float margin = v_misc.w;
  float glow = v_misc.y;
  vec2 inner = v_size - 2.0 * margin;
  vec2 p = v_local - v_size * 0.5;
  float r = min(v_misc.x, min(inner.x, inner.y) * 0.5);
  float d = sdRoundBox(p, inner * 0.5, r);
  float inside = 1.0 - smoothstep(-1.0, 1.0, d);
  float gy = clamp((v_screenY / max(v_misc.z, 1.0)) / 0.75, 0.0, 1.0);
  float grad = glow > 0.0 ? mix(0.62, 1.0, gy) : 1.0;
  float glowFall = exp(-max(d, 0.0) / 6.0) * glow;
  float fillA = inside * grad;
  float glowA = glowFall * 0.5 * (1.0 - inside);
  float a = clamp(fillA + glowA, 0.0, 1.0) * v_color.a;
  gl_FragColor = vec4(v_color.rgb * a, a); // premultiplied alpha
}`;

/** ANGLE instanced-drawing extension (WebGL 1.0). */
interface AngleInstanced {
  drawArraysInstancedANGLE(mode: number, first: number, count: number, primcount: number): void;
  vertexAttribDivisorANGLE(index: number, divisor: number): void;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('WebGL: createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('WebGL shader compile failed: ' + log);
  }
  return sh;
}

/**
 * Instanced WebGL note renderer drawing into a transparent offscreen canvas.
 * Create only when a WebGL context with instancing is available; otherwise the
 * caller falls back to Canvas2D. `dispose()` releases GPU resources.
 */
export class WebGLNoteBackend {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private angle: AngleInstanced;
  private program: WebGLProgram;
  private quadBuf: WebGLBuffer;
  private instBuf: WebGLBuffer;
  private locUnit: number;
  private locRect: number;
  private locColor: number;
  private locMisc: number;
  private uResolution: WebGLUniformLocation | null;
  private capacity = 0;
  cssW = 0;
  cssH = 0;
  dpr = 1;
  /** Number of instances drawn in the last draw() (diagnostics / tests). */
  lastCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const opts = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      depth: false,
      stencil: false,
    };
    const gl = (canvas.getContext('webgl', opts) ||
      canvas.getContext('experimental-webgl', opts)) as WebGLRenderingContext | null;
    if (!gl) throw new Error('WebGL is not supported');
    const angle = gl.getExtension('ANGLE_instanced_arrays') as AngleInstanced | null;
    if (!angle) throw new Error('WebGL instancing (ANGLE_instanced_arrays) is not supported');
    this.gl = gl;
    this.angle = angle;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL: createProgram failed');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('WebGL program link failed: ' + gl.getProgramInfoLog(program));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    this.locUnit = gl.getAttribLocation(program, 'a_unit');
    this.locRect = gl.getAttribLocation(program, 'a_rect');
    this.locColor = gl.getAttribLocation(program, 'a_color');
    this.locMisc = gl.getAttribLocation(program, 'a_misc');
    this.uResolution = gl.getUniformLocation(program, 'u_resolution');

    const quadBuf = gl.createBuffer();
    const instBuf = gl.createBuffer();
    if (!quadBuf || !instBuf) throw new Error('WebGL: buffer creation failed');
    this.quadBuf = quadBuf;
    this.instBuf = instBuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha
    gl.clearColor(0, 0, 0, 0);
  }

  resize(w: number, h: number, dpr: number): void {
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.gl.viewport(0, 0, pw, ph);
  }

  /** Render the visible notes into the offscreen canvas (transparent background). */
  draw(scene: NoteScene): void {
    const gl = this.gl;
    const angle = this.angle;
    gl.clear(gl.COLOR_BUFFER_BIT);
    const { data, count } = buildNoteInstances(scene);
    this.lastCount = count;
    if (count === 0) return;
    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution, this.cssW, this.cssH);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(this.locUnit);
    gl.vertexAttribPointer(this.locUnit, 2, gl.FLOAT, false, 0, 0);
    angle.vertexAttribDivisorANGLE(this.locUnit, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    if (count > this.capacity) {
      this.capacity = Math.max(count, Math.ceil(this.capacity * 1.5), 256);
      gl.bufferData(gl.ARRAY_BUFFER, this.capacity * INSTANCE_STRIDE, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    for (const [loc, offset] of [[this.locRect, 0], [this.locColor, 16], [this.locMisc, 32]] as const) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, INSTANCE_STRIDE, offset);
      angle.vertexAttribDivisorANGLE(loc, 1);
    }
    angle.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, count);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.instBuf);
    gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/**
 * Try to create a GPU note backend using the document that owns `canvas`.
 * Returns null when there is no document (headless tests) or no WebGL support,
 * so the caller can fall back to Canvas2D without throwing.
 */
export function createNoteBackend(canvas: HTMLCanvasElement): WebGLNoteBackend | null {
  const doc = (canvas as unknown as { ownerDocument?: Document }).ownerDocument;
  const off = doc?.createElement?.('canvas');
  if (!off) return null;
  try {
    return new WebGLNoteBackend(off);
  } catch {
    return null;
  }
}