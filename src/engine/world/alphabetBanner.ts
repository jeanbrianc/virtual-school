import * as THREE from 'three';
import { canvasTexture } from '../render/textures';

const COLORS = ['#ffce45', '#56cddd', '#ff879d', '#85ce7b', '#b493ee', '#ffaf66'];
/** The classroom's actual alphabet strip: each letter is a separate scene tile. */
export class AlphabetBanner {
  readonly root = new THREE.Group();
  readonly tiles = new Map<string, THREE.Mesh>();
  active: string | null = null;
  found: string[] = [];
  private stars = new Map<string, THREE.Mesh>();
  private textures = new Map<string, THREE.CanvasTexture>();
  constructor() {
    this.root.name = 'alphabet-banner';
    this.root.userData.dynamic = true;
    this.root.position.set(0, 4.18, -9.72);
    const starTexture = canvasTexture(128, 128, (ctx) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.fillStyle = '#fff6a6';
      ctx.strokeStyle = '#814e00';
      ctx.lineWidth = 8;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? 26 : 57;
        const x = 64 + Math.cos(a) * r,
          y = 64 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    for (const [i, letter] of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].entries()) {
      const texture = canvasTexture(128, 128, (ctx) => {
        ctx.fillStyle = COLORS[i % COLORS.length]!;
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#fffbed';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, 120, 120);
        ctx.fillStyle = '#252c4b';
        ctx.font = 'bold 86px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, 64, 67);
      });
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), new THREE.MeshBasicMaterial({ map: texture }));
      tile.name = `alphabet-letter-${letter}`;
      tile.position.set(((i % 13) - 6) * 0.6, i < 13 ? 0.32 : -0.32, 0);
      const star = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ map: starTexture, transparent: true }));
      star.position.copy(tile.position).add(new THREE.Vector3(0.2, 0.2, 0.14));
      star.visible = false;
      this.root.add(star);
      this.stars.set(letter, star);
      this.root.add(tile);
      this.tiles.set(letter, tile);
      this.textures.set(letter, texture);
    }
  }
  setState(active: string | null, found: string[]) {
    this.active = active;
    this.found = [...found];
    for (const [letter, tile] of this.tiles) {
      tile.scale.setScalar(letter === active ? 1.35 : 1);
      tile.position.z = letter === active ? 0.1 : 0;
      const material = tile.material as THREE.MeshBasicMaterial;
      material.color.set(found.includes(letter) ? '#c5ffd5' : '#ffffff');
      this.stars.get(letter)!.visible = found.includes(letter);
      tile.userData.active = letter === active;
      tile.userData.found = found.includes(letter);
    }
  }
  targetPosition(letter: string) {
    return this.tiles.get(letter)?.getWorldPosition(new THREE.Vector3()) ?? this.root.getWorldPosition(new THREE.Vector3());
  }
}
