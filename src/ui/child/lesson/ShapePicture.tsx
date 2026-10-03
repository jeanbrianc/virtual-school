import type { Shape } from '../../../domain/lessons/patterns';
const COLORS: Record<Shape, string> = { circle: '#27b7c3', triangle: '#ffbe35', square: '#eb688d' };
/** Real bold geometry, readable by outline even without color. */
export function ShapePicture({ shape }: { shape: Shape }) {
  return (
    <svg className="shape-picture" viewBox="0 0 160 160" role="img" aria-label={shape}>
      <g fill={COLORS[shape]} stroke="#26304f" strokeWidth="5" strokeLinejoin="round">
        {shape === 'circle' ? (
          <circle cx="80" cy="80" r="72" />
        ) : shape === 'triangle' ? (
          <path d="M80 8 154 150H6Z" />
        ) : (
          <rect x="8" y="8" width="144" height="144" rx="9" />
        )}
      </g>
      <path
        d={shape === 'triangle' ? 'M80 38 53 90' : shape === 'circle' ? 'M49 43Q33 54 31 77' : 'M40 40H87'}
        stroke="#ffffffa8"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
        aria-hidden="true"
      />
    </svg>
  );
}
