/**
 * Procedural "kid art" (crayon drawings) used for the art line in the 3D
 * school and as placeholder artwork in the parent portfolio. Pure canvas 2D,
 * shared by the engine and the UI so both show the same drawing for a seed.
 */
import { createRng } from '../domain/util/random';
import { ROUNDED } from './coverPainter';

export const KID_ART_SIZE = { w: 384, h: 288 } as const;

export function paintKidArt(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, signature?: string): void {
  const rng = createRng(seed);
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, w, h);
  const crayon = (color: string, width = 8) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };
  const kind = seed % 4;
  ctx.fillStyle = '#9fd0e8';
  ctx.fillRect(0, 0, w, h * 0.12);
  crayon('#f2c14e', 6);
  ctx.beginPath();
  ctx.arc(w - 50, 50, 26, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(w - 50 + Math.cos(a) * 34, 50 + Math.sin(a) * 34);
    ctx.lineTo(w - 50 + Math.cos(a) * 48, 50 + Math.sin(a) * 48);
    ctx.stroke();
  }
  crayon('#5aa64b', 10);
  ctx.beginPath();
  ctx.moveTo(0, h - 30);
  for (let x = 0; x <= w; x += 24) ctx.lineTo(x, h - 30 + Math.sin(x * 0.08) * 6);
  ctx.stroke();
  if (kind === 0) {
    // Sunflowers.
    for (let i = 0; i < 3; i++) {
      const x = 70 + i * 100 + rng() * 20;
      const top = 90 + rng() * 50;
      crayon('#4f8a45', 7);
      ctx.beginPath();
      ctx.moveTo(x, h - 30);
      ctx.lineTo(x, top);
      ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      for (let p = 0; p < 10; p++) {
        const a = (p / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 24, top + Math.sin(a) * 24, 14, 7, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#8a5a33';
      ctx.beginPath();
      ctx.arc(x, top, 15, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 1) {
    // House with family.
    ctx.fillStyle = '#e07a5f';
    ctx.fillRect(60, 130, 130, 110);
    ctx.fillStyle = '#7a5236';
    ctx.beginPath();
    ctx.moveTo(45, 132);
    ctx.lineTo(125, 70);
    ctx.lineTo(205, 132);
    ctx.fill();
    ctx.fillStyle = '#f2cc8f';
    ctx.fillRect(110, 180, 30, 60);
    for (let i = 0; i < 3; i++) {
      const x = 240 + i * 38;
      const s = i === 2 ? 0.7 : 1;
      crayon(['#3d85c6', '#f15bb5', '#9b5de5'][i] ?? '#333', 5);
      ctx.beginPath();
      ctx.arc(x, 170 + (1 - s) * 30, 13 * s, 0, Math.PI * 2);
      ctx.moveTo(x, 183 + (1 - s) * 30);
      ctx.lineTo(x, 225);
      ctx.moveTo(x - 15 * s, 200);
      ctx.lineTo(x + 15 * s, 200);
      ctx.moveTo(x, 225);
      ctx.lineTo(x - 10, 250);
      ctx.moveTo(x, 225);
      ctx.lineTo(x + 10, 250);
      ctx.stroke();
    }
  } else if (kind === 2) {
    // Rainbow.
    ['#e63946', '#f4a261', '#f2c14e', '#5aa64b', '#3d85c6', '#9b5de5'].forEach((c, i) => {
      crayon(c, 14);
      ctx.beginPath();
      ctx.arc(w / 2, h - 30, 150 - i * 16, Math.PI, 0);
      ctx.stroke();
    });
  } else {
    // Map scribble.
    crayon('#7a5236', 6);
    ctx.strokeRect(50, 60, 280, 170);
    ctx.beginPath();
    ctx.moveTo(190, 60);
    ctx.lineTo(190, 230);
    ctx.moveTo(50, 150);
    ctx.lineTo(190, 150);
    ctx.stroke();
    ctx.fillStyle = '#e07a5f';
    ctx.font = `600 22px ${ROUNDED}`;
    ctx.fillText('kichen', 70, 110);
    ctx.fillText('my rum', 210, 110);
  }
  // Signature (the child's name, in crayon capitals).
  if (signature) {
    ctx.fillStyle = '#3d85c6';
    ctx.font = `600 26px ${ROUNDED}`;
    ctx.fillText(signature.toUpperCase().slice(0, 10), 20 + Math.floor(rng() * 10), h - 8);
  }
}

const cache = new Map<string, string>();

/** Data URL of a kid-art drawing (cached per seed + signature). */
export function kidArtDataUrl(seed: number, signature?: string): string {
  const key = `${seed}:${signature ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = KID_ART_SIZE.w;
  canvas.height = KID_ART_SIZE.h;
  const c = canvas.getContext('2d');
  if (!c) return '';
  paintKidArt(c, canvas.width, canvas.height, seed, signature);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
