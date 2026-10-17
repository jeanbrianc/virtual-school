import type { RoutinePicture as Picture } from '../../../domain/lessons/routine';

/** Original vector art. Shape, position and outline distinguish actions without color or text. */
export function RoutinePicture({ picture }: { picture: Picture }) {
  const bag = ['open-bag', 'block', 'ball', 'close-bag'].includes(picture);
  const closed = picture.startsWith('close');
  const item = !picture.startsWith('open') && !closed;
  return (
    <svg viewBox="0 0 150 120" aria-hidden="true" focusable="false" className="routine-picture">
      <rect x="3" y="3" width="144" height="114" rx="16" fill="#f6f0df" />
      <g stroke="#233f42" strokeWidth="4" strokeLinejoin="round">
        {bag ? <path d="M35 58 Q30 93 36 106 H114 Q120 93 115 58 Z" fill="#e9bb61" /> : <path d="M28 65 H122 V106 H28 Z" fill="#82bdb5" />}
        {!closed && <ellipse cx="75" cy={bag ? 59 : 65} rx={bag ? 39 : 45} ry="10" fill="#334c55" />}
        {picture === 'open-box' && <path d="M29 49 42 25 129 40 118 58 Z" fill="#a4d4cb" />}
        {picture === 'close-box' && <path d="M24 59 H126 V72 H24 Z" fill="#a4d4cb" />}
        {picture === 'open-bag' && <path d="M40 56 Q32 12 61 25 M110 56 Q119 12 89 25" fill="none" />}
        {picture === 'close-bag' && <path d="M36 57 Q75 70 114 57 M42 57 Q40 25 75 27 Q110 25 108 57" fill="none" />}
        {picture === 'paper' && <path d="M39 13 82 7 89 44 46 50 Z" fill="white" />}
        {picture === 'crayons' && (
          <>
            <path d="M46 13 53 4 60 13 V45 H46 Z" fill="#d88365" />
            <path d="M70 18 77 9 84 18 V50 H70 Z" fill="#7085c4" />
          </>
        )}
        {picture === 'block' && (
          <>
            <path d="M43 14 67 7 87 20 62 28 Z" fill="#df9a82" />
            <path d="M43 14 V41 L62 53 V28 Z" fill="#ba6f61" />
            <path d="M62 28 87 20 V44 L62 53 Z" fill="#e8b299" />
          </>
        )}
        {picture === 'ball' && (
          <>
            <circle cx="63" cy="30" r="22" fill="#dbaa55" />
            <path d="M44 20 Q62 26 82 18 M46 44 Q56 27 57 9 M62 51 Q74 30 79 18" fill="none" />
          </>
        )}
      </g>
      {item && <path d="M104 19 V44 H96 L111 59 126 44 H118 V19 Z" fill="#233f42" />}
      {closed && <path d="M60 82 71 92 92 78" fill="none" stroke="#233f42" strokeWidth="5" />}
    </svg>
  );
}
