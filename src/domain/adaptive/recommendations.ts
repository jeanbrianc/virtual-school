/**
 * "Just beyond mastery" recommendations.
 *
 * For each strand we find the frontier (highest difficulty already proficient)
 * and suggest, in priority order:
 *   1. skills that need review (previously proficient, recent struggles)
 *   2. developing skills — keep practicing toward independence
 *   3. ready-to-learn skills — prerequisites proficient, difficulty ≤ frontier + 1
 *   4. proficient skills that could be consolidated to mastery
 */
import { SKILLS, getDomain, type Skill } from '../curriculum';
import { effectiveLevel, masteryRank } from '../mastery/masteryEngine';
import type { MasteryLevel, MasteryRecord } from '../types';

export type RecommendationReason = 'review' | 'continue' | 'ready' | 'consolidate';

export interface Recommendation {
  skillId: string;
  skill: Skill;
  reason: RecommendationReason;
  priority: number;
  /** Parent-facing explanation. */
  rationale: string;
  /** A lesson in the school that exercises this skill, if any. */
  lessonId?: string;
  activityIdea: string;
}

const REASON_WEIGHT: Record<RecommendationReason, number> = { review: 400, continue: 300, ready: 200, consolidate: 100 };

export function isProficientOrAbove(level: MasteryLevel): boolean {
  return masteryRank(level) >= masteryRank('proficient');
}

export function prerequisitesMet(skill: Skill, levels: Map<string, MasteryLevel>): boolean {
  return skill.prerequisites.every((p) => isProficientOrAbove(levels.get(p) ?? 'not_started'));
}

export function recommendNext(records: MasteryRecord[], options: { limit?: number; domainId?: string; perDomain?: number } = {}): Recommendation[] {
  const recordMap = new Map(records.map((r) => [r.skillId, r]));
  const levels = new Map(SKILLS.map((s) => [s.id, effectiveLevel(recordMap.get(s.id))]));

  // Frontier per strand.
  const frontier = new Map<string, number>();
  for (const s of SKILLS) {
    if (isProficientOrAbove(levels.get(s.id) ?? 'not_started')) {
      frontier.set(s.strandId, Math.max(frontier.get(s.strandId) ?? -1, s.difficulty));
    }
  }

  const recs: Recommendation[] = [];
  for (const skill of SKILLS) {
    if (options.domainId && skill.domainId !== options.domainId) continue;
    const level = levels.get(skill.id) ?? 'not_started';
    const record = recordMap.get(skill.id);
    const front = frontier.get(skill.strandId) ?? -1;
    const domainName = getDomain(skill.domainId)?.name ?? skill.domainId;
    let reason: RecommendationReason | null = null;
    let rationale = '';

    if (record?.needsReview) {
      reason = 'review';
      rationale = `Recent practice on “${skill.name}” was harder than before — a gentle review will help it stick.`;
    } else if (level === 'developing') {
      reason = 'continue';
      rationale = `She succeeds with support on “${skill.name}”. More practice should build independence.`;
    } else if ((level === 'not_started' || level === 'introduced') && prerequisitesMet(skill, levels)) {
      if (skill.difficulty <= front + 1 || front === -1) {
        reason = 'ready';
        rationale =
          skill.prerequisites.length > 0
            ? `Prerequisites are in place — a natural next step in ${domainName}.`
            : `A good entry point in ${domainName}; just beyond what she’s shown so far.`;
      }
    } else if (level === 'proficient') {
      reason = 'consolidate';
      rationale = `Proficient on “${skill.name}”; varied practice across a few more days would confirm mastery.`;
    }
    if (!reason) continue;

    // Closer to the frontier = more "just beyond mastery".
    const distance = Math.abs(skill.difficulty - (front + 1));
    const primaryBoost = getDomain(skill.domainId)?.primary ? 25 : 0;
    const priority = REASON_WEIGHT[reason] + primaryBoost - distance * 10 - (reason === 'ready' ? skill.difficulty : 0);
    const lessonId = skill.lessonIds[0];
    recs.push({
      skillId: skill.id,
      skill,
      reason,
      priority,
      rationale,
      ...(lessonId ? { lessonId } : {}),
      activityIdea: skill.activityIdea,
    });
  }

  recs.sort((a, b) => b.priority - a.priority || a.skill.difficulty - b.skill.difficulty);

  if (options.perDomain) {
    const perDomainCount = new Map<string, number>();
    const limited = recs.filter((r) => {
      const n = perDomainCount.get(r.skill.domainId) ?? 0;
      if (n >= (options.perDomain ?? 0)) return false;
      perDomainCount.set(r.skill.domainId, n + 1);
      return true;
    });
    return options.limit ? limited.slice(0, options.limit) : limited;
  }
  return options.limit ? recs.slice(0, options.limit) : recs;
}

/**
 * Starting tier for an adaptive lesson from current mastery of the skills
 * each tier exercises: begin at the first tier that isn't yet proficient.
 */
export function chooseStartTier(tierSkills: string[], records: MasteryRecord[]): number {
  const map = new Map(records.map((r) => [r.skillId, effectiveLevel(r)]));
  for (let i = 0; i < tierSkills.length; i++) {
    const level = map.get(tierSkills[i] ?? '') ?? 'not_started';
    if (!isProficientOrAbove(level)) return i;
  }
  return Math.max(0, tierSkills.length - 1);
}
