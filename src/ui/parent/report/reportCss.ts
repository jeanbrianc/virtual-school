/**
 * Report styles live in one string so the on-screen report, the printed
 * report and the downloaded standalone .html file look identical.
 * Everything is scoped under `.report-doc`.
 */
export const REPORT_CSS = `
.report-doc { --ink:#2d2620; --muted:#6f655b; --line:#e9e0d2; --paper:#fffdf8; --accent:#2a817b; --warm:#c8553d;
  font-family: 'Nunito', 'Segoe UI', system-ui, sans-serif; color: var(--ink); background: var(--paper);
  max-width: 860px; margin: 0 auto; padding: 40px 48px; border-radius: 16px; line-height: 1.55; font-size: 15px;
  box-shadow: 0 1px 2px rgba(60,40,20,.06), 0 8px 30px rgba(60,40,20,.08); }
.report-doc h1, .report-doc h2, .report-doc h3 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; line-height: 1.2; margin: 0; }
.report-doc h1 { font-size: 30px; }
.report-doc h2 { font-size: 20px; margin: 30px 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--line); }
.report-doc h3 { font-size: 16px; margin: 0 0 4px; }
.report-doc p { margin: 0 0 10px; }
.report-doc .r-head { display: flex; gap: 20px; align-items: center; margin-bottom: 18px; }
.report-doc .r-head .avatar-portrait { width: 88px; height: 88px; border-radius: 50%; background: #f4ead9; overflow: hidden; flex: none; display: inline-block; }
.report-doc .r-head .avatar-portrait img { width: 100%; height: 100%; display: block; }
.report-doc .r-period { color: var(--muted); font-size: 14px; margin-top: 4px; }
.report-doc .r-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 18px 0; }
.report-doc .r-stat { background: #f6efe3; border-radius: 12px; padding: 10px 14px; }
.report-doc .r-stat-value { font-family: 'Fraunces', Georgia, serif; font-size: 26px; font-weight: 600; }
.report-doc .r-stat-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.report-doc .r-stat-detail { font-size: 12px; color: var(--muted); }
.report-doc .r-narrative p { font-size: 16px; }
.report-doc .r-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin: 12px 0; }
.report-doc .r-photos img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 10px; background: #f4ead9; display: block; }
.report-doc .r-books { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.report-doc .r-book { display: flex; gap: 12px; align-items: flex-start; }
.report-doc .r-book img { width: 44px; height: auto; border-radius: 3px; box-shadow: 0 2px 6px rgba(0,0,0,.15); flex: none; }
.report-doc .r-book-meta { color: var(--muted); font-size: 13px; }
.report-doc .r-domains { display: grid; gap: 12px; }
.report-doc .r-domain { border: 1px solid var(--line); border-left: 5px solid var(--dc, var(--accent)); border-radius: 10px; padding: 12px 16px; break-inside: avoid; }
.report-doc .r-domain-head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: baseline; }
.report-doc .r-desc { font-size: 13px; color: var(--muted); }
.report-doc .r-domain ul { margin: 6px 0 0; padding-left: 18px; }
.report-doc .r-codes { font-size: 12px; color: var(--muted); margin-top: 6px; }
.report-doc table { width: 100%; border-collapse: collapse; font-size: 13px; }
.report-doc th, .report-doc td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.report-doc th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; }
.report-doc .r-milestones { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.report-doc .r-milestones li { background: #fff4d6; border-radius: 999px; padding: 4px 12px; font-size: 14px; }
.report-doc .r-next li { margin-bottom: 8px; }
.report-doc .r-foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.report-doc.family { font-size: 17px; }
.report-doc.family h1 { font-size: 34px; color: var(--warm); }
.report-doc.family .r-narrative p { font-size: 18px; }
.report-doc.family .r-photos { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
@media (max-width: 640px) { .report-doc { padding: 24px 18px; } .report-doc h1 { font-size: 24px; } }
@media print {
  .report-doc { box-shadow: none; padding: 0; max-width: none; background: #fff; }
  .report-doc h2 { break-after: avoid; }
  .report-doc .r-photos img, .report-doc .r-book { break-inside: avoid; }
}
`;
