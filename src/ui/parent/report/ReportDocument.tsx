import type { ReportContent } from '../../../domain/reports/reportTypes';
import type { AvatarConfig, Book } from '../../../domain/types';
import { dayFromTimestamp, formatDay } from '../../../domain/util/time';
import { AvatarPortrait } from '../../shared/AvatarPortrait';
import { BookCover } from '../../shared/BookCover';
import { MediaImage } from '../components';
import { REPORT_CSS } from './reportCss';

/**
 * Renders a saved report snapshot. The same DOM is printed and exported
 * as a standalone HTML file (see exportReportHtml).
 */
export function ReportDocument({ content, books, avatar }: { content: ReportContent; books: Book[]; avatar: AvatarConfig | undefined }) {
  const family = content.audience === 'family';
  const coverFor = (title: string) => books.find((b) => b.title === title);
  return (
    <article className={`report-doc ${family ? 'family' : 'parent'}`} data-testid="report-doc">
      <style>{REPORT_CSS}</style>
      <header className="r-head">
        {avatar && <AvatarPortrait avatar={avatar} size={88} className="r-portrait-wrap" />}
        <div>
          <h1>{content.headline}</h1>
          <div className="r-period">
            {content.periodLabel} · prepared {formatDay(dayFromTimestamp(content.generatedAt), 'long')}
          </div>
        </div>
      </header>

      <div className="r-stats">
        {content.stats.map((s) => (
          <div key={s.label} className="r-stat">
            <div className="r-stat-value">{s.value}</div>
            <div className="r-stat-label">{s.label}</div>
            {s.detail && <div className="r-stat-detail">{s.detail}</div>}
          </div>
        ))}
      </div>

      <section className="r-narrative">
        {content.narrative.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>

      {content.mediaIds.length > 0 && (
        <section>
          <h2>{family ? 'Snapshots' : 'Photos & work samples'}</h2>
          <div className="r-photos">
            {content.mediaIds.map((id) => (
              <MediaImage key={id} id={id} alt="Learning photo" />
            ))}
          </div>
        </section>
      )}

      {(content.reading.completed.length > 0 || content.reading.inProgress.length > 0) && (
        <section>
          <h2>{family ? 'Books she read' : 'Reading'}</h2>
          <ul className="r-books">
            {content.reading.completed.map((b) => {
              const book = coverFor(b.title);
              return (
                <li key={b.title} className="r-book">
                  {book && <BookCover title={book.title} author={book.author} cover={book.cover} width={44} />}
                  <div>
                    <h3>
                      {b.title} {b.rating ? <span aria-label={`${b.rating} stars`}>{'★'.repeat(b.rating)}</span> : null}
                    </h3>
                    <div className="r-book-meta">
                      {b.author}
                      {b.dateCompleted ? ` · finished ${formatDay(b.dateCompleted)}` : ''}
                      {!family ? ` · ${b.mode}` : ''}
                    </div>
                    {b.favoritePart && <div>Favorite part: “{b.favoritePart}”</div>}
                    {b.notes && <div className="r-book-meta">{b.notes}</div>}
                  </div>
                </li>
              );
            })}
            {content.reading.inProgress.map((b) => (
              <li key={b.title} className="r-book">
                <div>
                  <h3>{b.title}</h3>
                  <div className="r-book-meta">Currently reading · {b.progress}</div>
                </div>
              </li>
            ))}
          </ul>
          {!family && content.reading.comprehension.length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Comprehension & narration evidence</h3>
              <ul>
                {content.reading.comprehension.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {content.domains.length > 0 && (
        <section>
          <h2>{family ? 'What she explored' : 'Progress by subject'}</h2>
          <div className="r-domains">
            {content.domains.map((d) => (
              <div key={d.domainId} className="r-domain" style={{ ['--dc' as string]: d.color }}>
                <div className="r-domain-head">
                  <h3>{d.name}</h3>
                  {!family && (
                    <span className="r-desc">
                      {d.descriptor}
                      {d.workingLabel && d.workingLabel !== '—' ? ` · ${d.workingLabel}` : ''} · {d.evidenceCount} records
                    </span>
                  )}
                </div>
                {d.advanced.length > 0 && (
                  <p className="r-desc">
                    {family ? 'Growing: ' : 'Advanced: '}
                    {d.advanced.map((a) => (family ? a.childName || a.skillName : `${a.skillName} → ${a.to.toLowerCase()}`)).join('; ')}
                  </p>
                )}
                {d.highlights.length > 0 && (
                  <ul>
                    {d.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
                {!family && d.standards.length > 0 && <div className="r-codes">Aligned standards: {d.standards.join(', ')}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {!family && content.highlights.length > 0 && (
        <section>
          <h2>Evidence highlights</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Evidence</th>
                <th>Subject</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              {content.highlights.map((h, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDay(h.date)}</td>
                  <td>
                    {h.statement}
                    <div className="r-book-meta">{h.source}</div>
                  </td>
                  <td>{h.domainName}</td>
                  <td>{h.independence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {content.activities.length > 0 && (
        <section>
          <h2>{family ? 'Adventures' : 'Activities'}</h2>
          <table>
            <tbody>
              {content.activities.map((a, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap', width: 90 }}>{formatDay(a.date)}</td>
                  <td>
                    {a.title}
                    {a.minutes ? <span className="r-book-meta"> · {a.minutes} min</span> : null}
                  </td>
                  <td className="r-book-meta">{a.domains.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {content.milestones.length > 0 && (
        <section>
          <h2>{family ? 'Surprises she unlocked' : 'Milestones'}</h2>
          <ul className="r-milestones">
            {content.milestones.map((m, i) => (
              <li key={i}>
                {m.icon} {m.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.nextSteps.length > 0 && (
        <section>
          <h2>{family ? 'Coming up next' : 'Suggested next steps'}</h2>
          <ul className="r-next">
            {content.nextSteps.map((n) => (
              <li key={n.title}>
                <strong>{n.title}</strong>
                {!family && <span className="r-book-meta"> — {n.rationale}</span>}
                <div>{n.idea}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="r-foot">{content.disclaimer}</footer>
    </article>
  );
}

/** Builds a self-contained HTML file (photos inlined as data URLs) from the rendered report. */
export async function exportReportHtml(root: HTMLElement, title: string, loadMedia: (id: string) => Promise<Blob | undefined>): Promise<Blob> {
  const clone = root.cloneNode(true) as HTMLElement;
  const imgs = Array.from(clone.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const mediaId = img.getAttribute('data-media-id');
      if (!mediaId) return; // covers and portraits are already data URLs
      const blob = await loadMedia(mediaId);
      if (!blob) {
        img.remove();
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      img.setAttribute('src', dataUrl);
      img.removeAttribute('data-media-id');
    }),
  );
  clone.querySelectorAll('style').forEach((s) => s.remove());
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;padding:24px;background:#f3ecdf}.avatar-portrait{display:inline-block;border-radius:50%;overflow:hidden;background:#f4ead9}.avatar-portrait img{display:block}${REPORT_CSS}</style></head><body>${clone.outerHTML}</body></html>`;
  return new Blob([html], { type: 'text/html' });
}
