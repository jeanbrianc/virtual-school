/**
 * Procedural textures painted on Canvas 2D at load time. They give the
 * school hand-made material detail (wood grain, beadboard, rugs, chalk, kid
 * art) without shipping image assets. Swap any of these for authored
 * textures later via the AssetRegistry.
 */
import * as THREE from 'three';
import { createRng, type Rng } from '../../domain/util/random';
import { ROUNDED, SERIF } from '../../shared/coverPainter';
import { KID_ART_SIZE, paintKidArt } from '../../shared/kidArtPainter';
import { PALETTE } from '../palette';

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export function canvasTexture(
  w: number,
  h: number,
  paint: Paint,
  opts: { repeat?: [number, number]; srgb?: boolean; anisotropy?: number } = {},
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.anisotropy = opts.anisotropy ?? 8;
  return tex;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tint(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + delta * 255)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function grain(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, w: number, h: number, color: string, count: number) {
  ctx.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.05 + rng() * 0.08;
    ctx.lineWidth = 0.6 + rng() * 1.4;
    const gy = y + rng() * h;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    const segs = 6;
    for (let s = 1; s <= segs; s++) {
      ctx.lineTo(x + (w * s) / segs, gy + (rng() - 0.5) * h * 0.08);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function woodFloorTexture(): THREE.CanvasTexture {
  return canvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const rng = createRng(7);
      const rows = 10;
      const rowH = h / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rng() * w * 0.5;
        while (x < w) {
          const len = w * (0.45 + rng() * 0.5);
          const tone = (rng() - 0.5) * 0.05;
          ctx.fillStyle = tint(PALETTE.floor, tone);
          ctx.fillRect(x, r * rowH, len, rowH);
          grain(ctx, rng, x, r * rowH, len, rowH, PALETTE.floorDark, 14);
          // Knot.
          if (rng() < 0.25) {
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = PALETTE.floorDark;
            ctx.beginPath();
            ctx.ellipse(x + len * rng(), r * rowH + rowH * (0.3 + rng() * 0.4), 9, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = 'rgba(70,40,20,0.28)';
          ctx.fillRect(x, r * rowH, 2, rowH);
          x += len;
        }
        ctx.fillStyle = 'rgba(70,40,20,0.24)';
        ctx.fillRect(0, r * rowH, w, 2);
      }
    },
    { repeat: [5, 5] },
  );
}

export function wallpaperTexture(): THREE.CanvasTexture {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(0, 0, w, h);
      // Soft vertical stripes.
      for (let x = 0; x < w; x += 64) {
        ctx.fillStyle = 'rgba(214,190,150,0.14)';
        ctx.fillRect(x, 0, 22, h);
      }
      // Tiny sprig motif.
      const rng = createRng(11);
      for (let y = 32; y < h; y += 96) {
        for (let x = 43; x < w; x += 128) {
          const ox = x + ((y / 96) % 2) * 64;
          ctx.strokeStyle = 'rgba(122,150,110,0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ox, y + 12);
          ctx.quadraticCurveTo(ox + 3, y, ox, y - 12);
          ctx.stroke();
          ctx.fillStyle = 'rgba(122,150,110,0.3)';
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(ox + s * 6, y - 2 + rng() * 4, 6, 3, s * 0.6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(217,119,75,0.35)';
          ctx.beginPath();
          ctx.arc(ox, y - 14, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    { repeat: [8, 1.5] },
  );
}

export function beadboardTexture(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.wainscot;
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        const g = ctx.createLinearGradient(x, 0, x + 32, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.12)');
        g.addColorStop(0.15, 'rgba(255,255,255,0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0.02)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, 32, h);
      }
    },
    { repeat: [24, 1] },
  );
}

/** The classroom rug's canvas size and its 1–10 number circles (texture pixels). */
export const CLASSROOM_RUG_CANVAS = { w: 1024, h: 768, border: 64, numberRadius: 44 } as const;

/** Where each number sits on the classroom rug, as 0…1 texture coordinates (u across, v down). */
export function rugNumberSpots(): { n: number; u: number; v: number }[] {
  const { w, h, border } = CLASSROOM_RUG_CANVAS;
  return Array.from({ length: 10 }, (_, i) => {
    const x = border + 60 + (i % 5) * ((w - 2 * border - 120) / 4);
    const y = i < 5 ? h * 0.38 : h * 0.66;
    return { n: i + 1, u: x / w, v: y / h };
  });
}

export function rugTexture(kind: 'classroom' | 'library' | 'nook'): THREE.CanvasTexture {
  return canvasTexture(1024, kind === 'classroom' ? 768 : 1024, (ctx, w, h) => {
    const rng = createRng(kind.length * 13);
    if (kind === 'library') {
      const rings = [PALETTE.terracotta, PALETTE.cream, PALETTE.mustard, PALETTE.cream, '#c9644a', '#f1dcb4', PALETTE.teal, PALETTE.cream];
      rings.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, (w / 2) * (1 - i / rings.length), 0, Math.PI * 2);
        ctx.fill();
      });
      // Braided texture.
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 1400; i++) {
        const a = rng() * Math.PI * 2;
        const r = rng() * w * 0.5;
        ctx.fillStyle = rng() < 0.5 ? '#000' : '#fff';
        ctx.fillRect(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 5, 2);
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (kind === 'nook') {
      ctx.fillStyle = '#e9c7c0';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.5)' : 'rgba(180,100,90,0.25)';
        ctx.lineWidth = 12;
        ctx.strokeRect(20 + i * 14, 20 + i * 14, w - 40 - i * 28, h - 40 - i * 28);
      }
      return;
    }
    // Classroom: navy field, cream inner, alphabet border squares.
    ctx.fillStyle = PALETTE.navy;
    ctx.fillRect(0, 0, w, h);
    const colors = [PALETTE.terracotta, PALETTE.mustard, PALETTE.wainscot, '#7fc8c0', PALETTE.blush, '#9b8ec9'];
    const cell = 64;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let li = 0;
    ctx.font = `700 40px ${ROUNDED}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const drawCell = (x: number, y: number) => {
      ctx.fillStyle = colors[li % colors.length] ?? PALETTE.mustard;
      ctx.fillRect(x + 4, y + 4, cell - 8, cell - 8);
      ctx.fillStyle = PALETTE.cream;
      ctx.fillText(letters[li % 26] ?? 'A', x + cell / 2, y + cell / 2 + 2);
      li++;
    };
    for (let x = 0; x < w; x += cell) drawCell(x, 0);
    for (let y = cell; y < h - cell; y += cell) drawCell(w - cell, y);
    for (let x = w - cell; x >= 0; x -= cell) drawCell(x, h - cell);
    for (let y = h - 2 * cell; y >= cell; y -= cell) drawCell(0, y);
    ctx.fillStyle = '#f1e2c4';
    ctx.fillRect(cell + 12, cell + 12, w - 2 * cell - 24, h - 2 * cell - 24);
    // Hopscotch-ish number path in the middle.
    ctx.font = `700 46px ${ROUNDED}`;
    for (const { n: i, u, v } of rugNumberSpots()) {
      const x = u * w;
      const y = v * h;
      ctx.fillStyle = colors[i % colors.length] ?? PALETTE.mustard;
      ctx.beginPath();
      ctx.arc(x, y, CLASSROOM_RUG_CANVAS.numberRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.cream;
      ctx.fillText(String(i), x, y + 3);
    }
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = rng() < 0.5 ? '#000' : '#fff';
      ctx.fillRect(rng() * w, rng() * h, 2, 2);
    }
    ctx.globalAlpha = 1;
  });
}

export function chalkboardTexture(lines: string[], sub: string): THREE.CanvasTexture {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.chalk;
    ctx.fillRect(0, 0, w, h);
    const rng = createRng(3);
    // Eraser smudges.
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.02 + rng() * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(rng() * w, rng() * h, 60 + rng() * 120, 20 + rng() * 40, rng(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f4f1e8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 84px ${ROUNDED}`;
    lines.forEach((l, i) => ctx.fillText(l, w / 2, 140 + i * 100));
    ctx.font = `500 38px ${ROUNDED}`;
    ctx.fillStyle = '#f2d98b';
    ctx.fillText(sub, w / 2, h - 80);
    // Chalk doodles: sun + stars + a little book.
    ctx.strokeStyle = '#f7d27a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(110, 110, 38, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(110 + Math.cos(a) * 50, 110 + Math.sin(a) * 50);
      ctx.lineTo(110 + Math.cos(a) * 68, 110 + Math.sin(a) * 68);
      ctx.stroke();
    }
    ctx.strokeStyle = '#a8d8e0';
    for (const [sx, sy] of [
      [900, 90],
      [950, 170],
      [860, 200],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const px = sx + Math.cos(a) * 20;
        const py = sy + Math.sin(a) * 20;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#f4f1e8';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, w, h);
  });
}

export function signTexture(text: string, opts: { bg?: string; fg?: string; icon?: string; w?: number; h?: number } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 160;
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = opts.bg ?? PALETTE.cream;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 28);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.stroke();
    ctx.fillStyle = opts.fg ?? PALETTE.walnut;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.round(h * 0.42);
    ctx.font = `600 ${size}px ${ROUNDED}`;
    const label = opts.icon ? `${opts.icon}  ${text}` : text;
    let fontSize = size;
    while (ctx.measureText(label).width > w - 48 && fontSize > 18) {
      fontSize -= 2;
      ctx.font = `600 ${fontSize}px ${ROUNDED}`;
    }
    ctx.fillText(label, w / 2, h / 2 + 3);
  });
}

export function posterTexture(kind: 'numberline' | 'shapes' | 'solar' | 'plants' | 'alphabet' | 'calendar' | 'map', date?: Date): THREE.CanvasTexture {
  const sizes: Record<typeof kind, [number, number]> = {
    numberline: [1024, 256],
    shapes: [512, 640],
    solar: [768, 512],
    plants: [512, 640],
    alphabet: [1024, 160],
    calendar: [512, 512],
    map: [768, 512],
  };
  const [w, h] = sizes[kind];
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = PALETTE.cream;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const colors = [PALETTE.terracotta, PALETTE.mustard, PALETTE.wainscot, '#7fc8c0', PALETTE.blush, '#9b8ec9', PALETTE.teal];
    switch (kind) {
      case 'numberline': {
        ctx.strokeStyle = PALETTE.navy;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(30, h * 0.62);
        ctx.lineTo(w - 30, h * 0.62);
        ctx.stroke();
        ctx.font = `700 40px ${ROUNDED}`;
        for (let i = 0; i <= 20; i++) {
          const x = 44 + (i * (w - 88)) / 20;
          ctx.fillStyle = colors[i % colors.length] ?? PALETTE.teal;
          ctx.beginPath();
          ctx.arc(x, h * 0.62, i % 5 === 0 ? 14 : 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.navy;
          ctx.fillText(String(i), x, h * 0.3);
        }
        break;
      }
      case 'shapes': {
        ctx.font = `700 54px ${ROUNDED}`;
        ctx.fillStyle = PALETTE.navy;
        ctx.fillText('Shapes', w / 2, 60);
        const cells: [string, (x: number, y: number) => void][] = [
          [
            'circle',
            (x, y) => {
              ctx.beginPath();
              ctx.arc(x, y, 60, 0, Math.PI * 2);
              ctx.fill();
            },
          ],
          ['square', (x, y) => ctx.fillRect(x - 55, y - 55, 110, 110)],
          [
            'triangle',
            (x, y) => {
              ctx.beginPath();
              ctx.moveTo(x, y - 62);
              ctx.lineTo(x + 64, y + 50);
              ctx.lineTo(x - 64, y + 50);
              ctx.fill();
            },
          ],
          [
            'hexagon',
            (x, y) => {
              ctx.beginPath();
              for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const px = x + Math.cos(a) * 62;
                const py = y + Math.sin(a) * 62;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              }
              ctx.fill();
            },
          ],
        ];
        cells.forEach(([label, draw], i) => {
          const x = i % 2 ? w * 0.73 : w * 0.27;
          const y = i < 2 ? 220 : 470;
          ctx.fillStyle = colors[i] ?? PALETTE.teal;
          draw(x, y);
          ctx.fillStyle = PALETTE.navy;
          ctx.font = `600 34px ${ROUNDED}`;
          ctx.fillText(label, x, y + 100);
        });
        break;
      }
      case 'solar': {
        ctx.fillStyle = PALETTE.night;
        ctx.fillRect(0, 0, w, h);
        const rng = createRng(21);
        for (let i = 0; i < 120; i++) {
          ctx.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.7})`;
          ctx.fillRect(rng() * w, rng() * h, 2, 2);
        }
        ctx.fillStyle = '#ffcc4d';
        ctx.beginPath();
        ctx.arc(-40, h / 2, 150, 0, Math.PI * 2);
        ctx.fill();
        const planets: [number, string][] = [
          [10, '#b9a38c'],
          [16, '#e9c07b'],
          [17, '#5aa0d6'],
          [13, '#d9774b'],
          [34, '#d9b38c'],
          [30, '#e8d29a'],
          [22, '#9fd6e0'],
          [21, '#4f7bd6'],
        ];
        let x = 150;
        planets.forEach(([r, c]) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x, h / 2, r, 0, Math.PI * 2);
          ctx.fill();
          x += r * 2 + 30;
        });
        ctx.font = `600 40px ${ROUNDED}`;
        ctx.fillStyle = '#f3e6cf';
        ctx.fillText('Our Solar System', w / 2, 50);
        break;
      }
      case 'plants': {
        ctx.font = `700 46px ${ROUNDED}`;
        ctx.fillStyle = PALETTE.leafDark;
        ctx.fillText('How a Seed Grows', w / 2, 56);
        const steps = ['seed', 'sprout', 'seedling', 'flower'];
        steps.forEach((s, i) => {
          const y = 150 + i * 120;
          ctx.fillStyle = '#8a5a33';
          ctx.fillRect(60, y + 30, 120, 16);
          ctx.fillStyle = PALETTE.leaf;
          if (i > 0) ctx.fillRect(116, y + 30 - i * 18, 8, i * 18);
          if (i > 1) {
            ctx.beginPath();
            ctx.ellipse(104, y + 10 - i * 8, 18, 8, -0.5, 0, Math.PI * 2);
            ctx.ellipse(136, y + 10 - i * 8, 18, 8, 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
          if (i === 3) {
            ctx.fillStyle = PALETTE.mustard;
            ctx.beginPath();
            ctx.arc(120, y - 40, 16, 0, Math.PI * 2);
            ctx.fill();
          }
          if (i === 0) {
            ctx.fillStyle = '#6b4a2b';
            ctx.beginPath();
            ctx.ellipse(120, y + 24, 10, 6, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = PALETTE.navy;
          ctx.font = `600 36px ${ROUNDED}`;
          ctx.textAlign = 'left';
          ctx.fillText(`${i + 1}. ${s}`, 230, y + 20);
          ctx.textAlign = 'center';
        });
        break;
      }
      case 'alphabet': {
        const letters = 'AaBbCcDdEeFfGgHhIiJjKkLlMm';
        const cell = w / 13;
        ctx.font = `700 64px ${ROUNDED}`;
        for (let i = 0; i < 13; i++) {
          ctx.fillStyle = colors[i % colors.length] ?? PALETTE.teal;
          ctx.fillRect(i * cell + 4, 8, cell - 8, h - 16);
          ctx.fillStyle = PALETTE.cream;
          ctx.fillText(`${letters[i * 2]}${letters[i * 2 + 1]}`, i * cell + cell / 2, h / 2 + 4);
        }
        break;
      }
      case 'calendar': {
        const d = date ?? new Date();
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        ctx.fillStyle = PALETTE.terracotta;
        ctx.fillRect(0, 0, w, 130);
        ctx.fillStyle = PALETTE.cream;
        ctx.font = `700 64px ${ROUNDED}`;
        ctx.fillText(months[d.getMonth()] ?? '', w / 2, 70);
        ctx.fillStyle = PALETTE.navy;
        ctx.font = `700 220px ${SERIF}`;
        ctx.fillText(String(d.getDate()), w / 2, 300);
        ctx.font = `600 54px ${ROUNDED}`;
        ctx.fillText(days[d.getDay()] ?? '', w / 2, 450);
        break;
      }
      case 'map': {
        ctx.fillStyle = '#9fd0dc';
        ctx.fillRect(0, 0, w, h);
        const rng = createRng(5);
        const land = [PALETTE.wainscot, '#c9d68f', '#e8c98b', '#b5d39a', '#d9b38c'];
        const blobs: [number, number, number, number][] = [
          [170, 170, 110, 80],
          [220, 330, 60, 110],
          [410, 160, 80, 60],
          [430, 300, 70, 110],
          [590, 190, 130, 90],
          [640, 380, 60, 40],
        ];
        blobs.forEach(([x, y, rx, ry], i) => {
          ctx.fillStyle = land[i % land.length] ?? PALETTE.wainscot;
          ctx.beginPath();
          for (let a = 0; a <= 24; a++) {
            const t = (a / 24) * Math.PI * 2;
            const k = 0.8 + rng() * 0.35;
            const px = x + Math.cos(t) * rx * k;
            const py = y + Math.sin(t) * ry * k;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        });
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        for (let x = 0; x < w; x += 96) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        break;
      }
    }
  });
}

/** Painted landscape seen through the windows. */
export function landscapeTexture(): THREE.CanvasTexture {
  return canvasTexture(
    2048,
    512,
    (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#8fc8e8');
      sky.addColorStop(0.55, '#d8eef2');
      sky.addColorStop(1, '#f6ead0');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const rng = createRng(17);
      // Clouds.
      for (let i = 0; i < 12; i++) {
        const cx = rng() * w;
        const cy = 40 + rng() * 140;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let j = 0; j < 5; j++) {
          ctx.beginPath();
          ctx.ellipse(cx + j * 38 - 76, cy + (j % 2) * -12, 46 + rng() * 20, 26 + rng() * 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Rolling hills.
      const hills: [string, number, number][] = [
        ['#a9c98d', 0.62, 60],
        ['#8db873', 0.72, 40],
        ['#76a35e', 0.84, 30],
      ];
      for (const [color, base, amp] of hills) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 16) {
          ctx.lineTo(x, h * base + Math.sin(x * 0.004 + base * 10) * amp + Math.sin(x * 0.011) * amp * 0.4);
        }
        ctx.lineTo(w, h);
        ctx.fill();
      }
      // Trees.
      for (let i = 0; i < 70; i++) {
        const x = rng() * w;
        const y = h * (0.66 + rng() * 0.22);
        const s = 14 + rng() * 26;
        ctx.fillStyle = '#6b4a2b';
        ctx.fillRect(x - 2, y, 4, s * 0.8);
        ctx.fillStyle = rng() < 0.3 ? '#d9a441' : rng() < 0.5 ? '#c9643f' : '#4f8a45';
        ctx.beginPath();
        ctx.arc(x, y - s * 0.2, s * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { anisotropy: 4 },
  );
}

/** A child's artwork, generated deterministically from a seed. */
export function kidArtTexture(seed: number, signature?: string): THREE.CanvasTexture {
  return canvasTexture(KID_ART_SIZE.w, KID_ART_SIZE.h, (ctx, w, h) => paintKidArt(ctx, w, h, seed, signature));
}

export function radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  return canvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Feather-pattern belly for Professor Hoot. */
export function featherTexture(base: string, mark: string): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = mark;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let y = 20; y < h; y += 34) {
      for (let x = (y / 34) % 2 ? 26 : 8; x < w; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x - 9, y - 6);
        ctx.lineTo(x, y + 3);
        ctx.lineTo(x + 9, y - 6);
        ctx.stroke();
      }
    }
  });
}
