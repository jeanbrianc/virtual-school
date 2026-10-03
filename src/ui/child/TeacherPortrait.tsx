/** Hand-drawn vector portraits of the teachers for dialogue panels. */
import { isTeacherId } from '../../domain/teachers/registry';
import type { TeacherId } from '../../domain/teachers/teachers';

export function TeacherPortrait({ id, mood = 'happy', size = 120 }: { id: TeacherId | string; mood?: 'happy' | 'thinking' | 'cheer'; size?: number }) {
  if (!isTeacherId(id))
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Past teacher">
        <circle cx="60" cy="60" r="50" fill="#e2dbc9" />
        <text x="60" y="75" textAnchor="middle" fontSize="45">
          ★
        </text>
      </svg>
    );
  const blinkClass = 'portrait-blink';
  if (id === 'hoot') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Professor Hoot" className={`portrait portrait-${mood}`}>
        <circle cx="60" cy="60" r="58" fill="#f4e3c5" />
        <path d="M30 40 22 14l22 16zM90 40l8-26-22 16z" fill="#6a4e35" />
        <ellipse cx="60" cy="72" rx="40" ry="44" fill="#8b6b4a" />
        <ellipse cx="60" cy="92" rx="26" ry="24" fill="#f1dfbf" />
        <path d="M46 88l6 5 6-5M58 98l6 5 6-5M62 86l6 5 6-5" stroke="#caa77a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="43" cy="56" r="17" fill="#f1dfbf" />
        <circle cx="77" cy="56" r="17" fill="#f1dfbf" />
        <g className={blinkClass}>
          <circle cx="43" cy="56" r="11" fill="#fffdf5" />
          <circle cx="77" cy="56" r="11" fill="#fffdf5" />
          <circle cx="44" cy="57" r="7" fill="#e8a33b" />
          <circle cx="76" cy="57" r="7" fill="#e8a33b" />
          <circle cx="44" cy="57" r="4" fill="#1c1410" />
          <circle cx="76" cy="57" r="4" fill="#1c1410" />
          <circle cx="46" cy="55" r="1.6" fill="#fff" />
          <circle cx="78" cy="55" r="1.6" fill="#fff" />
        </g>
        <circle cx="43" cy="56" r="13" fill="none" stroke="#d9a441" strokeWidth="3" />
        <circle cx="77" cy="56" r="13" fill="none" stroke="#d9a441" strokeWidth="3" />
        <path d="M56 56h8" stroke="#d9a441" strokeWidth="3" />
        <path d="M55 66h10l-5 9z" fill="#e9a13b" />
        {mood === 'cheer' && <path d="M50 80q10 7 20 0" stroke="#5b2a2a" strokeWidth="3" fill="none" strokeLinecap="round" />}
        <path d="M52 108l8-5 8 5-8 5z" fill="#b8433a" />
      </svg>
    );
  }
  if (id === 'digit') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Digit the robot" className={`portrait portrait-${mood}`}>
        <circle cx="60" cy="60" r="58" fill="#dff1f0" />
        <line x1="60" y1="22" x2="60" y2="10" stroke="#9aa7ad" strokeWidth="3" />
        <circle cx="60" cy="9" r="6" fill="#ffd35c" className="portrait-glow" />
        <rect x="22" y="22" width="76" height="58" rx="20" fill="#f4f1ea" stroke="#d9e2e3" strokeWidth="2" />
        <rect x="14" y="42" width="10" height="18" rx="4" fill="#4aa3a8" />
        <rect x="96" y="42" width="10" height="18" rx="4" fill="#4aa3a8" />
        <rect x="31" y="31" width="58" height="40" rx="12" fill="#1c2a33" />
        <g className={blinkClass}>
          {mood === 'cheer' ? (
            <>
              <path d="M40 50l7-7 7 7M66 50l7-7 7 7" stroke="#8ff7ff" strokeWidth="4" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect x="41" y="40" width="11" height="14" rx="4" fill="#8ff7ff" />
              <rect x="68" y="40" width="11" height="14" rx="4" fill="#8ff7ff" />
            </>
          )}
        </g>
        <path d="M52 60q8 6 16 0" stroke="#8ff7ff" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="34" y="84" width="52" height="30" rx="12" fill="#f4f1ea" />
        <rect x="46" y="90" width="28" height="12" rx="4" fill="#4aa3a8" />
        <circle cx="54" cy="96" r="3" fill="#ffcf5c" />
        <circle cx="66" cy="96" r="3" fill="#ef6f6c" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Nova the red panda" className={`portrait portrait-${mood}`}>
      <circle cx="60" cy="60" r="58" fill="#e7f3ee" />
      <path d="M24 44 18 20l24 14zM96 44l6-24-24 14z" fill="#c65d3b" />
      <path d="M26 40 23 27l12 8zM94 40l3-13-12 8z" fill="#fbf4ea" />
      <rect x="28" y="92" width="64" height="30" rx="14" fill="#fbfbf7" />
      <ellipse cx="60" cy="62" rx="40" ry="36" fill="#c65d3b" />
      <ellipse cx="60" cy="74" rx="18" ry="13" fill="#fbf4ea" />
      <ellipse cx="38" cy="72" rx="12" ry="9" fill="#fbf4ea" />
      <ellipse cx="82" cy="72" rx="12" ry="9" fill="#fbf4ea" />
      <ellipse cx="45" cy="50" rx="7" ry="4" fill="#fbf4ea" />
      <ellipse cx="75" cy="50" rx="7" ry="4" fill="#fbf4ea" />
      <path d="M40 62l-4 14M80 62l4 14" stroke="#4a2a22" strokeWidth="6" strokeLinecap="round" />
      <g className={blinkClass}>
        <circle cx="45" cy="60" r="5" fill="#1c1410" />
        <circle cx="75" cy="60" r="5" fill="#1c1410" />
        <circle cx="46.5" cy="58.5" r="1.5" fill="#fff" />
        <circle cx="76.5" cy="58.5" r="1.5" fill="#fff" />
      </g>
      <ellipse cx="60" cy="68" rx="5" ry="3.5" fill="#231815" />
      <path d={mood === 'thinking' ? 'M55 79h10' : 'M53 77q7 6 14 0'} stroke="#231815" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M30 36q30-16 60 0" stroke="#3b3b4a" strokeWidth="4" fill="none" />
      <circle cx="47" cy="33" r="9" fill="#9fe6f0" stroke="#c9a24a" strokeWidth="3" />
      <circle cx="73" cy="33" r="9" fill="#9fe6f0" stroke="#c9a24a" strokeWidth="3" />
      <path d="M48 96l12 10 12-10" stroke="#e1e4df" strokeWidth="3" fill="none" />
    </svg>
  );
}
