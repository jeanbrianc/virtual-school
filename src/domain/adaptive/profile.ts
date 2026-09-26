/**
 * Per-domain capability estimates. There is deliberately no global "grade":
 * each strand gets its own working level derived from mastery evidence.
 */
import { DOMAINS, SKILLS, STRANDS, difficultyLabel, type DomainId, type Skill } from '../curriculum';
import { effectiveLevel, masteryRank } from '../mastery/masteryEngine';
import type { MasteryLevel, MasteryRecord } from '../types';

export type CapabilityDescriptor = 'not yet explored' | 'emerging' | 'developing' | 'strong' | 'advanced';

export interface StrandProfile {
  strandId: string;
  name: string;
  domainId: DomainId;
  descriptor: CapabilityDescriptor;
  /** Highest difficulty band with proficient-or-better evidence. */
  workingDifficulty: number | null;
  workingLabel: string;
  counts: Record<MasteryLevel, number>;
  skillCount: number;
}

export interface DomainProfile {
  domainId: DomainId;
  name: string;
  color: string;
  descriptor: CapabilityDescriptor;
  workingLabel: string;
  counts: Record<MasteryLevel, number>;
  skillCount: number;
  /** 0..1 share of the domain's skills at proficient or above. */
  proficiencyShare: number;
  strands: StrandProfile[];
}

const emptyCounts = (): Record<MasteryLevel, number> => ({
  not_started: 0,
  introduced: 0,
  developing: 0,
  proficient: 0,
  mastered: 0,
});

/**
 * Expected difficulty band for a child's age (parents only). A 3–4 year old
 * sits at Pre-K (0); each year adds a band. Used only to decide between
 * "strong" and "advanced".
 */
export function expectedDifficultyForAge(ageYears: number | null): number {
  if (ageYears === null) return 0;
  // 4 → Pre-K (0), 5 → Kindergarten (1), 6 → Grade 1 (2)…
  return Math.max(0, Math.min(5, Math.floor(ageYears) - 4));
}

function describe(
  skills: Skill[],
  records: Map<string, MasteryRecord>,
  expected: number,
): { descriptor: CapabilityDescriptor; working: number | null; counts: Record<MasteryLevel, number> } {
  const counts = emptyCounts();
  let working: number | null = null;
  let anyDeveloping = false;
  for (const skill of skills) {
    const level = effectiveLevel(records.get(skill.id));
    counts[level] += 1;
    if (masteryRank(level) >= masteryRank('proficient')) {
      working = working === null ? skill.difficulty : Math.max(working, skill.difficulty);
    }
    if (level === 'developing') anyDeveloping = true;
  }
  let descriptor: CapabilityDescriptor = 'not yet explored';
  if (counts.introduced > 0) descriptor = 'emerging';
  if (anyDeveloping) descriptor = 'developing';
  if (working !== null) descriptor = working >= expected + 2 ? 'advanced' : 'strong';
  return { descriptor, working, counts };
}

export function buildDomainProfiles(records: MasteryRecord[], ageYears: number | null): DomainProfile[] {
  const byId = new Map(records.map((r) => [r.skillId, r]));
  const expected = expectedDifficultyForAge(ageYears);
  return DOMAINS.map((domain) => {
    const strands: StrandProfile[] = STRANDS.filter((s) => s.domainId === domain.id).map((strand) => {
      const skills = SKILLS.filter((s) => s.strandId === strand.id);
      const d = describe(skills, byId, expected);
      return {
        strandId: strand.id,
        name: strand.name,
        domainId: domain.id,
        descriptor: d.descriptor,
        workingDifficulty: d.working,
        workingLabel: d.working === null ? '—' : `around ${difficultyLabel(d.working)} concepts`,
        counts: d.counts,
        skillCount: skills.length,
      };
    });
    const skills = SKILLS.filter((s) => s.domainId === domain.id);
    const d = describe(skills, byId, expected);
    const proficient = d.counts.proficient + d.counts.mastered;
    return {
      domainId: domain.id,
      name: domain.name,
      color: domain.color,
      descriptor: d.descriptor,
      workingLabel: d.working === null ? 'Not enough evidence yet' : `Working around ${difficultyLabel(d.working)} concepts`,
      counts: d.counts,
      skillCount: skills.length,
      proficiencyShare: skills.length ? proficient / skills.length : 0,
      strands,
    };
  });
}
