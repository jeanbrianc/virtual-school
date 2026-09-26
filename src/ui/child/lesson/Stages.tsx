/**
 * Visual "stages" for adaptive lessons: moon rocks to tap and count,
 * craters to compare, rockets to share into, and Nova's sink-or-float tank.
 * Every stage is touchable — manipulatives are always available.
 */
import { useEffect, useMemo, useState } from 'react';
import type { LessonVisual } from '../../../domain/lessons/types';
import { getTestObject } from '../../../domain/lessons/sinkFloat';
import { createRng } from '../../../domain/util/random';

function rockPath(seed: number): string {
  const rng = createRng(seed);
  const pts: string[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 15 + rng() * 5;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

function MoonRock({ seed, counted, faded, onTap }: { seed: number; counted?: number; faded?: boolean; onTap?: () => void }) {
  const d = useMemo(() => rockPath(seed), [seed]);
  return (
    <button
      type="button"
      className={`rock ${counted ? 'rock-counted' : ''} ${faded ? 'rock-faded' : ''}`}
      onClick={onTap}
      aria-label={counted ? `Rock number ${counted}` : 'Moon rock'}
    >
      <svg viewBox="-24 -24 48 48" width="44" height="44" aria-hidden="true">
        <path d={d} fill={counted ? '#d9d2c4' : '#b8b2a7'} stroke="#8d877c" strokeWidth="2" />
        <circle cx="-5" cy="-4" r="3.5" fill="#9f998e" />
        <circle cx="6" cy="5" r="2.5" fill="#9f998e" />
        <circle cx="3" cy="-8" r="1.8" fill="#9f998e" />
      </svg>
      {counted ? <span className="rock-num">{counted}</span> : null}
    </button>
  );
}

/** A group of rocks that can be tapped to count (numbers appear in order). */
function RockGroup({ count, seed, removed = 0, label }: { count: number; seed: number; removed?: number; label?: string }) {
  const [counted, setCounted] = useState<number[]>([]);
  useEffect(() => setCounted([]), [count, seed]);
  return (
    <div className="rock-group" aria-label={label ?? `${count} moon rocks`}>
      {Array.from({ length: count }, (_, i) => {
        const idx = counted.indexOf(i);
        return (
          <MoonRock
            key={i}
            seed={seed * 31 + i}
            {...(idx >= 0 ? { counted: idx + 1 } : {})}
            faded={i >= count - removed && removed > 0}
            onTap={() => setCounted((c) => (c.includes(i) ? c : [...c, i]))}
          />
        );
      })}
    </div>
  );
}

function Rocket({ fill, label }: { fill: number; label: string }) {
  return (
    <div className="mini-rocket" aria-label={label}>
      <svg viewBox="0 0 60 90" width="60" height="90" aria-hidden="true">
        <path d="M30 4c14 10 18 30 16 52H14C12 34 16 14 30 4z" fill="#f4f1ea" stroke="#c9c2b4" strokeWidth="2" />
        <circle cx="30" cy="32" r="8" fill="#8fe3ff" stroke="#4aa3a8" strokeWidth="3" />
        <path d="M14 56l-10 16h14zM46 56l10 16H42z" fill="#d9774b" />
        <path d="M22 60h16l-3 14h-10z" fill="#ffb84d" />
      </svg>
      <div className="mini-rocket-load">{fill > 0 ? fill : ''}</div>
    </div>
  );
}

function ShareStage({ total, groups, seed }: { total: number; groups: number; seed: number }) {
  const [dealt, setDealt] = useState(0);
  useEffect(() => setDealt(0), [total, groups, seed]);
  const per = Array.from({ length: groups }, (_, g) => Math.floor(dealt / groups) + (g < dealt % groups ? 1 : 0));
  return (
    <div className="share-stage">
      <div className="share-rockets">
        {per.map((n, i) => (
          <Rocket key={i} fill={n} label={`Rocket ${i + 1} has ${n} rocks`} />
        ))}
      </div>
      <div className="rock-group" aria-label={`${total - dealt} rocks left to share`}>
        {Array.from({ length: total - dealt }, (_, i) => (
          <MoonRock key={i} seed={seed + i} onTap={() => setDealt((d) => Math.min(total, d + 1))} />
        ))}
      </div>
      <p className="stage-tip">Tap a rock to load it into the next rocket!</p>
    </div>
  );
}

function TankStage({ objectId, showResult, floats, dropping }: { objectId: string; showResult?: boolean; floats?: boolean; dropping?: boolean }) {
  const obj = getTestObject(objectId);
  const state = dropping ? (floats ? 'drop-float' : 'drop-sink') : showResult ? (floats ? 'float' : 'sink') : 'hold';
  return (
    <div className="tank-stage">
      <div className="tank">
        <div className="tank-water">
          <div className="tank-surface" />
          {(dropping || showResult) && (floats ? null : <div className="bubbles" />)}
        </div>
        <div className={`tank-object ${state}`} aria-label={obj?.label}>
          {obj?.icon}
        </div>
      </div>
      <div className="tank-label">{obj?.label}</div>
    </div>
  );
}

export function LessonStage({ visual, seed, dropping }: { visual: LessonVisual; seed: number; dropping?: { floats: boolean } | null }) {
  switch (visual.type) {
    case 'rocks':
      return (
        <div className="stage stage-rocks">
          {visual.groups.map((n, i) => (
            <div key={i} className="stage-group">
              <RockGroup count={n} seed={seed + i * 100} {...(visual.removed ? { removed: visual.removed } : {})} />
              {visual.groups.length > 1 && i < visual.groups.length - 1 && <span className="stage-plus">+</span>}
            </div>
          ))}
          <p className="stage-tip">Tap the rocks to count them!</p>
        </div>
      );
    case 'compare':
      return (
        <div className="stage stage-compare">
          <div className="crater">
            <RockGroup count={visual.left} seed={seed + 1} />
          </div>
          <div className="crater">
            <RockGroup count={visual.right} seed={seed + 2} />
          </div>
        </div>
      );
    case 'share':
      return (
        <div className="stage">
          <ShareStage total={visual.total} groups={visual.groups} seed={seed} />
        </div>
      );
    case 'arrays':
      return (
        <div className="stage stage-arrays">
          {Array.from({ length: visual.groups }, (_, g) => (
            <div key={g} className="array-rocket">
              <Rocket fill={0} label={`Rocket ${g + 1}`} />
              <RockGroup count={visual.each} seed={seed + g * 7} />
            </div>
          ))}
        </div>
      );
    case 'object':
      return (
        <div className="stage stage-lab">
          <TankStage
            objectId={visual.objectId}
            {...(visual.showResult !== undefined ? { showResult: visual.showResult } : {})}
            {...(dropping ? { floats: dropping.floats, dropping: true } : visual.floats !== undefined ? { floats: visual.floats } : {})}
          />
        </div>
      );
    case 'objects':
      return (
        <div className="stage stage-lab stage-objects">
          {visual.objectIds.map((id) => (
            <div key={id} className="object-card">
              <span>{getTestObject(id)?.icon}</span>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}
