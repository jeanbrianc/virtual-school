/**
 * Procedural book covers & spines, painted with Canvas 2D.
 * Shared by the 3D engine (as textures) and the UI (as images) so a book
 * looks identical on the shelf, in Hoot's picker and in parent mode.
 * No copyrighted cover art is used — each cover is an original motif.
 */
import type { CoverMotif, CoverStyle } from '../domain/types';

type Ctx = CanvasRenderingContext2D;

export const SERIF = '"Fraunces", Georgia, serif';
export const ROUNDED = '"Fredoka", "Nunito", system-ui, sans-serif';

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount * 255);
  const g = clamp(((n >> 8) & 255) + amount * 255);
  const b = clamp((n & 255) + amount * 255);
  return `rgb(${r},${g},${b})`;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string) {
  ellipse(ctx, x, y, r, r, fill);
}

/** Draws a motif centered at (cx, cy) fitting in size s. */
export function drawMotif(ctx: Ctx, motif: CoverMotif, cx: number, cy: number, s: number, main: string, dark: string) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const u = s / 100;
  switch (motif) {
    case 'rabbit':
      ellipse(ctx, cx + 6 * u, cy + 18 * u, 30 * u, 24 * u, main);
      circle(ctx, cx - 18 * u, cy - 4 * u, 18 * u, main);
      ellipse(ctx, cx - 26 * u, cy - 34 * u, 6 * u, 20 * u, main, -0.25);
      ellipse(ctx, cx - 12 * u, cy - 36 * u, 6 * u, 20 * u, main, 0.15);
      circle(ctx, cx + 36 * u, cy + 12 * u, 8 * u, main);
      circle(ctx, cx - 23 * u, cy - 6 * u, 2.6 * u, dark);
      break;
    case 'frog':
      ellipse(ctx, cx, cy + 12 * u, 38 * u, 26 * u, main);
      circle(ctx, cx - 18 * u, cy - 14 * u, 13 * u, main);
      circle(ctx, cx + 18 * u, cy - 14 * u, 13 * u, main);
      circle(ctx, cx - 18 * u, cy - 14 * u, 6 * u, dark);
      circle(ctx, cx + 18 * u, cy - 14 * u, 6 * u, dark);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(cx, cy + 6 * u, 18 * u, 0.2, Math.PI - 0.2);
      ctx.stroke();
      break;
    case 'caterpillar':
      for (let i = 0; i < 5; i++) circle(ctx, cx - 36 * u + i * 16 * u, cy + 8 * u + (i % 2 ? -6 : 4) * u, 12 * u, i === 4 ? dark : main);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2.5 * u;
      ctx.beginPath();
      ctx.moveTo(cx + 30 * u, cy - 6 * u);
      ctx.lineTo(cx + 26 * u, cy - 24 * u);
      ctx.moveTo(cx + 36 * u, cy - 6 * u);
      ctx.lineTo(cx + 42 * u, cy - 22 * u);
      ctx.stroke();
      break;
    case 'pig':
      circle(ctx, cx, cy, 34 * u, main);
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.moveTo(cx - 30 * u, cy - 18 * u);
      ctx.lineTo(cx - 20 * u, cy - 46 * u);
      ctx.lineTo(cx - 6 * u, cy - 30 * u);
      ctx.moveTo(cx + 30 * u, cy - 18 * u);
      ctx.lineTo(cx + 20 * u, cy - 46 * u);
      ctx.lineTo(cx + 6 * u, cy - 30 * u);
      ctx.fill();
      ellipse(ctx, cx, cy + 10 * u, 14 * u, 10 * u, dark);
      circle(ctx, cx - 5 * u, cy + 10 * u, 3 * u, main);
      circle(ctx, cx + 5 * u, cy + 10 * u, 3 * u, main);
      circle(ctx, cx - 14 * u, cy - 8 * u, 3 * u, dark);
      circle(ctx, cx + 14 * u, cy - 8 * u, 3 * u, dark);
      break;
    case 'dog':
      circle(ctx, cx, cy, 30 * u, main);
      ellipse(ctx, cx - 30 * u, cy + 4 * u, 11 * u, 24 * u, dark, 0.2);
      ellipse(ctx, cx + 30 * u, cy + 4 * u, 11 * u, 24 * u, dark, -0.2);
      ellipse(ctx, cx, cy + 14 * u, 14 * u, 10 * u, shade('#ffffff', -0.05));
      circle(ctx, cx, cy + 9 * u, 5 * u, dark);
      circle(ctx, cx - 11 * u, cy - 6 * u, 3.5 * u, dark);
      circle(ctx, cx + 11 * u, cy - 6 * u, 3.5 * u, dark);
      break;
    case 'bear':
      circle(ctx, cx - 26 * u, cy - 26 * u, 12 * u, main);
      circle(ctx, cx + 26 * u, cy - 26 * u, 12 * u, main);
      circle(ctx, cx, cy, 34 * u, main);
      ellipse(ctx, cx, cy + 12 * u, 15 * u, 11 * u, shade(main, 0.18));
      circle(ctx, cx, cy + 8 * u, 5 * u, dark);
      circle(ctx, cx - 12 * u, cy - 8 * u, 3.5 * u, dark);
      circle(ctx, cx + 12 * u, cy - 8 * u, 3.5 * u, dark);
      break;
    case 'owl':
      ellipse(ctx, cx, cy + 6 * u, 30 * u, 38 * u, main);
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.moveTo(cx - 26 * u, cy - 22 * u);
      ctx.lineTo(cx - 20 * u, cy - 44 * u);
      ctx.lineTo(cx - 8 * u, cy - 28 * u);
      ctx.moveTo(cx + 26 * u, cy - 22 * u);
      ctx.lineTo(cx + 20 * u, cy - 44 * u);
      ctx.lineTo(cx + 8 * u, cy - 28 * u);
      ctx.fill();
      circle(ctx, cx - 12 * u, cy - 8 * u, 11 * u, '#fff8e8');
      circle(ctx, cx + 12 * u, cy - 8 * u, 11 * u, '#fff8e8');
      circle(ctx, cx - 12 * u, cy - 8 * u, 5 * u, dark);
      circle(ctx, cx + 12 * u, cy - 8 * u, 5 * u, dark);
      ctx.fillStyle = '#e9a13b';
      ctx.beginPath();
      ctx.moveTo(cx - 5 * u, cy + 4 * u);
      ctx.lineTo(cx + 5 * u, cy + 4 * u);
      ctx.lineTo(cx, cy + 13 * u);
      ctx.fill();
      break;
    case 'dino':
      ellipse(ctx, cx + 4 * u, cy + 14 * u, 30 * u, 18 * u, main);
      ctx.strokeStyle = main;
      ctx.lineWidth = 11 * u;
      ctx.beginPath();
      ctx.moveTo(cx - 16 * u, cy + 6 * u);
      ctx.quadraticCurveTo(cx - 30 * u, cy - 20 * u, cx - 22 * u, cy - 36 * u);
      ctx.moveTo(cx + 30 * u, cy + 16 * u);
      ctx.quadraticCurveTo(cx + 46 * u, cy + 20 * u, cx + 50 * u, cy + 4 * u);
      ctx.stroke();
      ellipse(ctx, cx - 18 * u, cy - 38 * u, 11 * u, 7 * u, main);
      ctx.lineWidth = 8 * u;
      ctx.beginPath();
      for (const lx of [-12, 0, 12, 22]) {
        ctx.moveTo(cx + lx * u, cy + 24 * u);
        ctx.lineTo(cx + lx * u, cy + 40 * u);
      }
      ctx.stroke();
      circle(ctx, cx - 16 * u, cy - 40 * u, 2 * u, dark);
      break;
    case 'spider': {
      ctx.strokeStyle = main;
      ctx.lineWidth = 1.6 * u;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 46 * u, cy + Math.sin(a) * 46 * u);
        ctx.stroke();
      }
      for (let r = 10; r <= 46; r += 9) {
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const px = cx + Math.cos(a) * r * u;
          const py = cy + Math.sin(a) * r * u;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      circle(ctx, cx + 8 * u, cy + 12 * u, 6 * u, dark);
      circle(ctx, cx + 8 * u, cy + 4 * u, 4 * u, dark);
      break;
    }
    case 'dragon':
      ctx.fillStyle = shade(main, -0.08);
      ctx.beginPath();
      ctx.moveTo(cx - 4 * u, cy - 4 * u);
      ctx.lineTo(cx - 40 * u, cy - 40 * u);
      ctx.lineTo(cx - 30 * u, cy - 6 * u);
      ctx.moveTo(cx + 8 * u, cy - 4 * u);
      ctx.lineTo(cx + 40 * u, cy - 42 * u);
      ctx.lineTo(cx + 34 * u, cy - 4 * u);
      ctx.fill();
      ellipse(ctx, cx, cy + 12 * u, 24 * u, 20 * u, main);
      circle(ctx, cx - 22 * u, cy - 10 * u, 14 * u, main);
      ctx.strokeStyle = main;
      ctx.lineWidth = 8 * u;
      ctx.beginPath();
      ctx.moveTo(cx + 20 * u, cy + 20 * u);
      ctx.quadraticCurveTo(cx + 44 * u, cy + 30 * u, cx + 44 * u, cy + 8 * u);
      ctx.stroke();
      circle(ctx, cx - 26 * u, cy - 12 * u, 3 * u, dark);
      break;
    case 'boxcar':
      roundRect(ctx, cx - 42 * u, cy - 22 * u, 84 * u, 40 * u, 4 * u);
      ctx.fillStyle = main;
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(cx - 12 * u, cy - 14 * u, 24 * u, 28 * u);
      for (const wx of [-28, -14, 14, 28]) circle(ctx, cx + wx * u, cy + 24 * u, 7 * u, dark);
      break;
    case 'magnifier':
      ctx.strokeStyle = main;
      ctx.lineWidth = 8 * u;
      ctx.beginPath();
      ctx.arc(cx - 8 * u, cy - 8 * u, 24 * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 11 * u;
      ctx.beginPath();
      ctx.moveTo(cx + 10 * u, cy + 10 * u);
      ctx.lineTo(cx + 36 * u, cy + 36 * u);
      ctx.stroke();
      break;
    case 'star':
    case 'heart':
    case 'leaf':
    case 'moon':
    case 'fish':
    case 'house':
      drawSimpleMotif(ctx, motif, cx, cy, u, main, dark);
      break;
  }
  ctx.restore();
}

function drawSimpleMotif(ctx: Ctx, motif: CoverMotif, cx: number, cy: number, u: number, main: string, dark: string) {
  ctx.fillStyle = main;
  switch (motif) {
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = (i % 2 === 0 ? 40 : 17) * u;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(cx, cy + 34 * u);
      ctx.bezierCurveTo(cx - 50 * u, cy, cx - 30 * u, cy - 40 * u, cx, cy - 16 * u);
      ctx.bezierCurveTo(cx + 30 * u, cy - 40 * u, cx + 50 * u, cy, cx, cy + 34 * u);
      ctx.fill();
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(cx - 34 * u, cy + 30 * u);
      ctx.quadraticCurveTo(cx - 30 * u, cy - 30 * u, cx + 34 * u, cy - 34 * u);
      ctx.quadraticCurveTo(cx + 30 * u, cy + 30 * u, cx - 34 * u, cy + 30 * u);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2.5 * u;
      ctx.beginPath();
      ctx.moveTo(cx - 34 * u, cy + 30 * u);
      ctx.lineTo(cx + 26 * u, cy - 26 * u);
      ctx.stroke();
      break;
    case 'moon':
      circle(ctx, cx, cy, 32 * u, main);
      ctx.globalCompositeOperation = 'destination-out';
      circle(ctx, cx + 14 * u, cy - 10 * u, 28 * u, '#000');
      ctx.globalCompositeOperation = 'source-over';
      for (const [sx, sy, r] of [
        [30, -30, 4],
        [38, 18, 3],
        [-36, -34, 2.5],
      ] as const) circle(ctx, cx + sx * u, cy + sy * u, r * u, main);
      break;
    case 'fish':
      ellipse(ctx, cx - 6 * u, cy, 32 * u, 20 * u, main);
      ctx.beginPath();
      ctx.moveTo(cx + 20 * u, cy);
      ctx.lineTo(cx + 44 * u, cy - 18 * u);
      ctx.lineTo(cx + 44 * u, cy + 18 * u);
      ctx.fill();
      circle(ctx, cx - 22 * u, cy - 4 * u, 3.5 * u, dark);
      break;
    case 'house':
      ctx.fillRect(cx - 28 * u, cy - 6 * u, 56 * u, 40 * u);
      ctx.beginPath();
      ctx.moveTo(cx - 38 * u, cy - 4 * u);
      ctx.lineTo(cx, cy - 38 * u);
      ctx.lineTo(cx + 38 * u, cy - 4 * u);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(cx - 7 * u, cy + 12 * u, 14 * u, 22 * u);
      ctx.fillRect(cx + 12 * u, cy + 2 * u, 10 * u, 10 * u);
      break;
    default:
      break;
  }
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export interface CoverInput {
  title: string;
  author: string;
  cover: CoverStyle;
}

/** Paints a front cover into a canvas of any size (aspect ~ 2:3). */
export function paintCover(ctx: Ctx, w: number, h: number, book: CoverInput): void {
  const { background, accent, motif } = book.cover;
  const dark = luminance(background) > 0.35 ? shade(background, -0.45) : shade(background, -0.25);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, shade(background, 0.06));
  grad.addColorStop(1, shade(background, -0.08));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Cloth texture.
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#000';
  for (let y = 0; y < h; y += Math.max(2, h / 180)) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
  // Spine shadow.
  const sg = ctx.createLinearGradient(0, 0, w * 0.08, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0.25)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w * 0.08, h);
  // Frame.
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, w * 0.018);
  roundRect(ctx, w * 0.08, h * 0.05, w * 0.84, h * 0.9, w * 0.04);
  ctx.stroke();
  // Motif.
  drawMotif(ctx, motif, w * 0.5, h * 0.38, Math.min(w, h) * 0.55, accent, dark);
  // Title.
  const titleSize = Math.round(w * (book.title.length > 22 ? 0.085 : 0.105));
  ctx.font = `700 ${titleSize}px ${SERIF}`;
  ctx.fillStyle = luminance(background) > 0.45 ? dark : accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapLines(ctx, book.title, w * 0.74).slice(0, 3);
  const lineH = titleSize * 1.12;
  const top = h * 0.72 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((l, i) => ctx.fillText(l, w * 0.5, top + i * lineH));
  if (book.author) {
    ctx.font = `500 ${Math.round(w * 0.055)}px ${SERIF}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(book.author, w * 0.5, h * 0.88);
    ctx.globalAlpha = 1;
  }
}

/** Paints a spine (tall, narrow) with a vertical title. */
export function paintSpine(ctx: Ctx, w: number, h: number, book: CoverInput): void {
  const { background, accent } = book.cover;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, shade(background, -0.12));
  grad.addColorStop(0.35, shade(background, 0.05));
  grad.addColorStop(1, shade(background, -0.16));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, h * 0.06, w, h * 0.018);
  ctx.fillRect(0, h * 0.92, w, h * 0.018);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `700 ${Math.round(w * 0.42)}px ${SERIF}`;
  ctx.fillStyle = luminance(background) > 0.45 ? shade(background, -0.55) : accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let title = book.title;
  while (ctx.measureText(title).width > h * 0.78 && title.length > 4) title = `${title.slice(0, -2).trimEnd()}…`.replace(/……$/, '…');
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

/** Convenience: a data URL for a cover (UI use). Cached by content. */
const coverCache = new Map<string, string>();
export function coverDataUrl(book: CoverInput, width = 240): string {
  const key = `${book.title}|${book.author}|${book.cover.background}|${book.cover.motif}|${width}`;
  const cached = coverCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * 1.45);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  paintCover(ctx, canvas.width, canvas.height, book);
  const url = canvas.toDataURL('image/png');
  coverCache.set(key, url);
  return url;
}

export function clearCoverCache(): void {
  coverCache.clear();
}
