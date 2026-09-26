/** Shared building blocks for the Parent Studio. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useServices } from '../../app/services';
import { getDomain, getSkill } from '../../domain/curriculum';
import { MASTERY_LABELS } from '../../domain/mastery/masteryEngine';
import type { Evidence, MasteryLevel } from '../../domain/types';
import { dayFromTimestamp, formatDay } from '../../domain/util/time';
import { Icon, type IconName } from '../shared/Icon';

/** Sequential ramp (validated for adjacent-step separation): introduced → mastered. */
export const LEVEL_COLORS: Record<MasteryLevel, string> = {
  not_started: '#ebe4d8',
  introduced: '#b3ddd6',
  developing: '#5fb0a7',
  proficient: '#2a817b',
  mastered: '#134946',
};

export function LevelBadge({ level, override }: { level: MasteryLevel; override?: boolean }) {
  const dark = level === 'proficient' || level === 'mastered';
  return (
    <span className={`level-badge level-${level}`} style={{ background: LEVEL_COLORS[level], color: dark ? '#fff' : '#1f3a38' }}>
      {MASTERY_LABELS[level]}
      {override ? <span title="Parent assessed"> ✎</span> : null}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
  icon,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: IconName;
}) {
  return (
    <section className={`p-card ${className}`}>
      {(title || action) && (
        <header className="p-card-head">
          {title && (
            <h2>
              {icon && <Icon name={icon} size={18} />}
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

const INDEP_LABEL: Record<string, string> = { independent: 'Independent', supported: 'With support', assisted: 'Adult-assisted' };
const SOURCE_ICON: Record<string, string> = { lesson: '🎮', book: '📖', activity: '🏡', observation: '👀', assessment: '📋' };

export function EvidenceItem({ e, showSkill = true }: { e: Evidence; showSkill?: boolean }) {
  const skill = getSkill(e.skillId);
  const domain = skill ? getDomain(skill.domainId) : undefined;
  return (
    <li className="evidence-item">
      <span className="evidence-src" title={e.source.type}>
        {SOURCE_ICON[e.source.type] ?? '•'}
      </span>
      <div className="evidence-body">
        <div className="evidence-statement">{e.statement}</div>
        {e.excerpt && e.excerpt !== e.statement && e.source.type === 'activity' && (
          <div className="evidence-excerpt" title="From your note">
            “{e.excerpt.length > 140 ? `${e.excerpt.slice(0, 140)}…` : e.excerpt}”
          </div>
        )}
        <div className="evidence-meta">
          {showSkill && skill && (
            <span className="tag" style={{ borderColor: domain?.color }}>
              <span className="tag-dot" style={{ background: domain?.color }} />
              {skill.name}
            </span>
          )}
          <span className={`indep indep-${e.independence}`}>{e.kind === 'exposure' ? 'Exposure' : INDEP_LABEL[e.independence]}</span>
          <span className="muted">{formatDay(dayFromTimestamp(e.observedAt))}</span>
          <span className="muted">· {e.source.label}</span>
          {e.isDemo && <span className="demo-tag">demo</span>}
        </div>
      </div>
    </li>
  );
}

/** Displays a locally stored photo (Blob) via an object URL. */
export function MediaImage({ id, alt, className = '' }: { id: string; alt: string; className?: string }) {
  const { ctx } = useServices();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    void ctx.repos.media.get(id).then((m) => {
      if (!alive || !m) return;
      revoke = URL.createObjectURL(m.blob);
      setUrl(revoke);
    });
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [ctx, id]);
  return url ? <img className={className} src={url} alt={alt} data-media-id={id} /> : <span className={`${className} media-missing`} aria-label={alt} />;
}

/** Stacked horizontal bar of mastery levels with legend-able segments and hover titles. */
export function LevelBar({ counts, total }: { counts: Record<MasteryLevel, number>; total: number }) {
  const order: MasteryLevel[] = ['mastered', 'proficient', 'developing', 'introduced'];
  return (
    <div className="level-bar" role="img" aria-label={order.map((l) => `${counts[l]} ${MASTERY_LABELS[l].toLowerCase()}`).join(', ') + ` of ${total} skills`}>
      {order.map((l) =>
        counts[l] > 0 ? (
          <span key={l} className="level-seg" style={{ flex: counts[l], background: LEVEL_COLORS[l] }} title={`${MASTERY_LABELS[l]}: ${counts[l]}`} />
        ) : null,
      )}
      <span
        className="level-seg rest"
        style={{ flex: Math.max(0, total - order.reduce((s, l) => s + counts[l], 0)) }}
        title={`Not started: ${counts.not_started}`}
      />
    </div>
  );
}

export function LevelLegend() {
  const order: MasteryLevel[] = ['introduced', 'developing', 'proficient', 'mastered'];
  return (
    <div className="legend">
      {order.map((l) => (
        <span key={l} className="legend-item">
          <span className="legend-swatch" style={{ background: LEVEL_COLORS[l] }} />
          {MASTERY_LABELS[l]}
        </span>
      ))}
      <span className="legend-item">
        <span className="legend-swatch rest" />
        Not started
      </span>
    </div>
  );
}

/** Weekly evidence columns (single series, hover tooltip, table fallback in aria-label). */
export function WeeklyBars({ weeks }: { weeks: { label: string; independent: number; supported: number; exposure: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...weeks.map((w) => w.independent + w.supported + w.exposure));
  const niceMax = Math.ceil(max / 4) * 4;
  const H = 150;
  const colW = 44;
  const W = weeks.length * colW + 36;
  const series = [
    { key: 'independent' as const, color: '#134946', label: 'Independent' },
    { key: 'supported' as const, color: '#5fb0a7', label: 'With support' },
    { key: 'exposure' as const, color: '#d8cdb9', label: 'Exposure' },
  ];
  return (
    <div className="weekly">
      <svg
        viewBox={`0 0 ${W} ${H + 28}`}
        width="100%"
        role="img"
        aria-label={weeks.map((w) => `${w.label}: ${w.independent} independent, ${w.supported} supported, ${w.exposure} exposure`).join('; ')}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={30} x2={W} y1={H - t * H + 4} y2={H - t * H + 4} stroke="#ece5d8" strokeWidth={1} />
            <text x={24} y={H - t * H + 8} textAnchor="end" fontSize="10" fill="#8c8177">
              {Math.round(niceMax * t)}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          let y = H + 4;
          const x = 36 + i * colW + (colW - 22) / 2;
          return (
            <g key={w.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
              <rect x={36 + i * colW} y={0} width={colW} height={H + 24} fill={hover === i ? 'rgba(42,129,123,0.06)' : 'transparent'} />
              {series.map((s) => {
                const v = w[s.key];
                if (!v) return null;
                const h = (v / niceMax) * H;
                y -= h;
                const rect = (
                  <rect
                    key={s.key}
                    x={x}
                    y={y + 1}
                    width={22}
                    height={Math.max(0, h - 2)}
                    rx={s.key === 'exposure' || (s.key === 'supported' && !w.exposure) || (s.key === 'independent' && !w.exposure && !w.supported) ? 4 : 0}
                    fill={s.color}
                  />
                );
                return rect;
              })}
              <text x={36 + i * colW + colW / 2} y={H + 20} textAnchor="middle" fontSize="10" fill="#5e554c">
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && weeks[hover] && (
        <div className="viz-tooltip" style={{ left: `${((36 + hover * colW + colW) / W) * 100}%` }}>
          <strong>Week of {weeks[hover]!.label}</strong>
          {series.map((s) => (
            <div key={s.key}>
              <span className="legend-swatch" style={{ background: s.color }} /> {s.label}: {weeks[hover]![s.key]}
            </div>
          ))}
        </div>
      )}
      <div className="legend">
        {series.map((s) => (
          <span key={s.key} className="legend-item">
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function useObjectUrl(file: Blob | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** Downscales an uploaded image to keep local storage lean (max 1600px, JPEG). */
export async function prepareImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) return { blob: file, width: bitmap.width, height: bitmap.height };
  c.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
  return { blob, width: w, height: h };
}
