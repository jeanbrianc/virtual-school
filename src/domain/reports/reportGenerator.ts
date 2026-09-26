/**
 * Learning report generator. Pure function over records → an immutable
 * ReportContent snapshot, in a parent (records) or family (warm, jargon-free)
 * voice. Only locally stored information is used.
 */
import { buildDomainProfiles } from '../adaptive/profile';
import { recommendNext } from '../adaptive/recommendations';
import { DOMAINS, getDomain, getSkill } from '../curriculum';
import { MASTERY_LABELS, masteryRank } from '../mastery/masteryEngine';
import { getReward } from '../rewards/catalog';
import type {
  Activity,
  Book,
  Child,
  DayString,
  Evidence,
  LessonAttempt,
  MasteryRecord,
  PortfolioItem,
  ReadingSession,
  ReportAudience,
  RewardUnlock,
  Timestamp,
} from '../types';
import { ageAt, dayFromTimestamp, formatDay, isWithin, monthName, parseDay } from '../util/time';
import type { ReportContent, ReportDomainSection, ReportHighlight } from './reportTypes';

export interface ReportInputs {
  child: Child;
  books: Book[];
  sessions: ReadingSession[];
  activities: Activity[];
  evidence: Evidence[];
  mastery: MasteryRecord[];
  lessons: LessonAttempt[];
  unlocks: RewardUnlock[];
  portfolio: PortfolioItem[];
}

export interface ReportRequest {
  audience: ReportAudience;
  start: DayString;
  end: DayString;
  now: Timestamp;
}

const INDEPENDENCE_LABEL: Record<string, string> = {
  independent: 'Independently',
  supported: 'With support',
  assisted: 'With adult help',
};

export function periodLabel(start: DayString, end: DayString): string {
  const s = parseDay(start);
  const e = parseDay(end);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const lastDay = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  if (sameMonth && s.getDate() === 1 && e.getDate() === lastDay) return `${monthName(start)} ${s.getFullYear()}`;
  return `${formatDay(start)} – ${formatDay(end)}, ${e.getFullYear()}`;
}

function stars(n?: number): string {
  return n ? '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)) : '';
}

function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function generateReport(input: ReportInputs, req: ReportRequest): ReportContent {
  const { child } = input;
  const inPeriod = (day: DayString) => isWithin(day, req.start, req.end);
  const family = req.audience === 'family';

  const booksDone = input.books
    .filter((b) => b.status === 'completed' && b.dateCompleted && inPeriod(b.dateCompleted))
    .sort((a, b) => (a.dateCompleted ?? '').localeCompare(b.dateCompleted ?? ''));
  const booksReading = input.books.filter((b) => b.status === 'reading');
  const activities = input.activities.filter((a) => inPeriod(a.date)).sort((a, b) => a.date.localeCompare(b.date));
  const evidence = input.evidence.filter((e) => inPeriod(dayFromTimestamp(e.observedAt)));
  const lessons = input.lessons.filter((l) => inPeriod(dayFromTimestamp(l.completedAt)));
  const unlocks = input.unlocks.filter((u) => inPeriod(dayFromTimestamp(u.unlockedAt)));
  const sessions = input.sessions.filter((s) => inPeriod(s.date));
  const portfolio = input.portfolio.filter((p) => inPeriod(p.date));

  // Time on learning (recorded durations only — never estimated).
  const activityMinutes = activities.reduce((sum, a) => sum + (a.durationMinutes ?? 0), 0);
  const readingMinutes = sessions.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const lessonMinutes = lessons.reduce(
    (sum, l) => sum + Math.max(1, Math.round((Date.parse(l.completedAt) - Date.parse(l.startedAt)) / 60000)),
    0,
  );
  const totalMinutes = activityMinutes + readingMinutes + lessonMinutes;

  // Skills that moved up during the period.
  const advanced = input.mastery
    .map((m) => {
      const changes = m.history.filter((h) => inPeriod(dayFromTimestamp(h.at)));
      const last = changes[changes.length - 1];
      if (!last) return null;
      const before = m.history.filter((h) => dayFromTimestamp(h.at) < req.start).pop();
      if (before && masteryRank(before.level) >= masteryRank(last.level)) return null;
      return { record: m, to: last.level };
    })
    .filter((x): x is { record: MasteryRecord; to: MasteryRecord['computedLevel'] } => x !== null && masteryRank(x.to) >= masteryRank('developing'));

  const ageYears = child.birthDate ? ageAt(child.birthDate, req.end).years : null;
  const profiles = buildDomainProfiles(input.mastery, ageYears);

  // Highlights: strongest, most specific evidence in the period.
  const highlightScore = (e: Evidence) =>
    (e.independence === 'independent' ? 3 : e.independence === 'supported' ? 2 : 0) +
    (e.kind === 'performance' ? 2 : e.kind === 'observation' ? 1 : 0) +
    (e.difficulty ?? 0) * 0.5 +
    Math.min(e.statement.length, 120) / 120;
  const seenStatements = new Set<string>();
  const highlights: ReportHighlight[] = [...evidence]
    .filter((e) => e.kind !== 'exposure')
    .sort((a, b) => highlightScore(b) - highlightScore(a))
    .filter((e) => {
      const key = e.statement.toLowerCase();
      if (seenStatements.has(key)) return false;
      seenStatements.add(key);
      return true;
    })
    .slice(0, family ? 6 : 10)
    .map((e) => {
      const skill = getSkill(e.skillId);
      return {
        date: dayFromTimestamp(e.observedAt),
        statement: family && skill ? `${skill.childName}: ${e.statement}` : e.statement,
        domainName: getDomain(skill?.domainId ?? '')?.name ?? '',
        independence: INDEPENDENCE_LABEL[e.independence] ?? e.independence,
        source: e.source.label,
      };
    });

  const domains: ReportDomainSection[] = DOMAINS.map((d) => {
    const domEvidence = evidence.filter((e) => getSkill(e.skillId)?.domainId === d.id);
    const profile = profiles.find((p) => p.domainId === d.id);
    const adv = advanced.filter((a) => getSkill(a.record.skillId)?.domainId === d.id);
    const standards = new Set<string>();
    for (const e of domEvidence) for (const s of getSkill(e.skillId)?.standards ?? []) standards.add(`${s.code}`);
    return {
      domainId: d.id,
      name: family ? d.childName : d.name,
      color: d.color,
      descriptor: profile?.descriptor ?? 'not yet explored',
      workingLabel: profile?.workingLabel ?? '',
      evidenceCount: domEvidence.length,
      advanced: adv.map((a) => ({
        skillName: getSkill(a.record.skillId)?.name ?? a.record.skillId,
        childName: getSkill(a.record.skillId)?.childName ?? '',
        to: MASTERY_LABELS[a.to],
      })),
      highlights: domEvidence
        .filter((e) => e.kind !== 'exposure')
        .slice(-3)
        .map((e) => e.statement),
      standards: [...standards].slice(0, 8),
    };
  }).filter((d) => d.evidenceCount > 0 || d.advanced.length > 0);

  const milestones = unlocks
    .map((u) => {
      const r = getReward(u.rewardId);
      return r ? { date: dayFromTimestamp(u.unlockedAt), title: family ? r.childTitle.replace(/!$/, '') : r.name, icon: r.icon } : null;
    })
    .filter((m): m is { date: string; title: string; icon: string } => m !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const recs = recommendNext(input.mastery, { perDomain: 1, limit: family ? 3 : 5 });
  const nextSteps = recs.map((r) => ({
    title: family ? r.skill.childName : r.skill.name,
    rationale: r.rationale,
    idea: r.activityIdea,
  }));

  const favorite = [...booksDone].sort((a, b) => (b.childRating ?? 0) - (a.childRating ?? 0))[0];
  const hours = totalMinutes >= 60 ? `${(totalMinutes / 60).toFixed(1)} hours` : `${totalMinutes} minutes`;
  const domainsTouched = new Set(evidence.map((e) => getSkill(e.skillId)?.domainId).filter(Boolean));
  const label = periodLabel(req.start, req.end);

  const narrative: string[] = [];
  if (family) {
    narrative.push(
      booksDone.length > 0
        ? `${child.name} read ${plural(booksDone.length, 'book')} during ${label}${favorite?.childRating ? ` — her favorite was ${favorite.title} (${stars(favorite.childRating)})` : ''}. Each one now sits on the bookshelf in her virtual school.`
        : `${child.name} kept reading and exploring during ${label}.`,
    );
    const disc = highlights.slice(0, 3).map((h) => h.statement.replace(/^[^:]+:\s*/, '').replace(/\.$/, '').toLowerCase());
    if (disc.length) narrative.push(`Some things she did: ${disc.join('; ')}.`);
    if (milestones.length) narrative.push(`Her school grew too — she unlocked ${milestones.map((m) => `${m.icon} ${m.title}`).join(', ')}.`);
    const q = activities.flatMap((a) => (a.childReflection ? [a.childReflection] : [])).slice(0, 2);
    if (q.length) narrative.push(`In her own words: ${q.map((x) => `“${x}”`).join(' ')}`);
  } else {
    narrative.push(
      `During ${label}, ${child.name} completed ${plural(booksDone.length, 'book')}, ${plural(lessons.length, 'in-app lesson')} and ${plural(activities.length, 'recorded activity', 'recorded activities')}, generating ${plural(evidence.length, 'piece')} of learning evidence across ${plural(domainsTouched.size, 'subject')}.`,
    );
    if (advanced.length) {
      narrative.push(
        `Skills that advanced: ${advanced
          .slice(0, 6)
          .map((a) => `${getSkill(a.record.skillId)?.name} (→ ${MASTERY_LABELS[a.to].toLowerCase()})`)
          .join('; ')}.`,
      );
    }
    const indep = evidence.filter((e) => e.independence === 'independent' && e.kind !== 'exposure').length;
    if (evidence.length) {
      narrative.push(
        `${Math.round((indep / Math.max(1, evidence.filter((e) => e.kind !== 'exposure').length)) * 100)}% of performance evidence was independent; the rest was with support. Exposure-only records (${evidence.filter((e) => e.kind === 'exposure').length}) are not counted toward mastery.`,
      );
    }
  }

  const stats = family
    ? [
        { label: 'Books read', value: String(booksDone.length) },
        { label: 'Adventures', value: String(activities.length + lessons.length) },
        { label: 'New things unlocked', value: String(milestones.length) },
      ]
    : [
        { label: 'Books completed', value: String(booksDone.length), detail: `${booksReading.length} in progress` },
        { label: 'Activities logged', value: String(activities.length) },
        { label: 'Lessons', value: String(lessons.length) },
        { label: 'Evidence records', value: String(evidence.length) },
        { label: 'Skills advanced', value: String(advanced.length) },
        { label: 'Recorded time', value: totalMinutes ? hours : '—' },
      ];

  const comprehension = evidence
    .filter((e) => (getSkill(e.skillId)?.strandId === 'reading.comprehension' || e.skillId === 'read.narration') && e.kind !== 'exposure')
    .map((e) => e.statement)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .slice(0, 6);

  const mediaIds = [...new Set([...activities.flatMap((a) => a.mediaIds), ...portfolio.flatMap((p) => p.mediaIds)])].slice(0, 8);

  return {
    childName: child.name,
    audience: req.audience,
    periodLabel: label,
    periodStart: req.start,
    periodEnd: req.end,
    generatedAt: req.now,
    headline: family
      ? `${child.name}’s learning adventures — ${label}`
      : `${child.name} — Learning summary, ${label}`,
    stats,
    narrative,
    reading: {
      completed: booksDone.map((b) => ({
        title: b.title,
        author: b.author,
        ...(b.dateCompleted ? { dateCompleted: b.dateCompleted } : {}),
        ...(b.childRating ? { rating: b.childRating } : {}),
        mode: b.readingMode.replace('_', ' '),
        ...(b.favoritePart ? { favoritePart: b.favoritePart } : {}),
        ...(!family && b.comprehensionNotes ? { notes: b.comprehensionNotes } : {}),
      })),
      inProgress: booksReading.map((b) => ({
        title: b.title,
        progress: b.totalChapters ? `Chapter ${b.chaptersRead ?? 0} of ${b.totalChapters}` : b.totalPages ? `Page ${b.pagesRead ?? 0} of ${b.totalPages}` : 'In progress',
      })),
      comprehension,
    },
    domains,
    highlights,
    activities: activities.map((a) => ({
      date: a.date,
      title: a.title,
      domains: a.domains.map((d) => (family ? getDomain(d)?.childName : getDomain(d)?.name) ?? d),
      ...(a.durationMinutes ? { minutes: a.durationMinutes } : {}),
      mediaIds: a.mediaIds,
    })),
    milestones,
    nextSteps,
    mediaIds,
    disclaimer: family
      ? 'Made with love from our family’s homeschool records.'
      : 'Generated locally from family records. Mastery levels are evidence-based estimates; standards references (Common Core, NGSS, etc.) are informative alignments, not official assessments.',
  };
}
