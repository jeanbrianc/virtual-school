import { DOMAINS, SKILLS, STRANDS } from './catalog';
import type { Domain, DomainId, Skill, Strand } from './types';

export * from './types';
export { DOMAINS, SKILLS, STRANDS };

const skillIndex = new Map(SKILLS.map((s) => [s.id, s]));
const domainIndex = new Map(DOMAINS.map((d) => [d.id, d]));
const strandIndex = new Map(STRANDS.map((s) => [s.id, s]));

export function getSkill(id: string): Skill | undefined {
  return skillIndex.get(id);
}

export function requireSkill(id: string): Skill {
  const skill = skillIndex.get(id);
  if (!skill) throw new Error(`Unknown skill: ${id}`);
  return skill;
}

export function getDomain(id: DomainId | string): Domain | undefined {
  return domainIndex.get(id as DomainId);
}

export function getStrand(id: string): Strand | undefined {
  return strandIndex.get(id);
}

export function skillsInDomain(domainId: DomainId): Skill[] {
  return SKILLS.filter((s) => s.domainId === domainId);
}

export function skillsInStrand(strandId: string): Skill[] {
  return SKILLS.filter((s) => s.strandId === strandId).sort((a, b) => a.difficulty - b.difficulty);
}

export function strandsInDomain(domainId: DomainId): Strand[] {
  return STRANDS.filter((s) => s.domainId === domainId);
}

export function skillsForLesson(lessonId: string): Skill[] {
  return SKILLS.filter((s) => s.lessonIds.includes(lessonId));
}

export function skillsWithTopic(topic: string): Skill[] {
  return SKILLS.filter((s) => s.topics.includes(topic));
}

export const DIFFICULTY_LABELS = ['Pre-K', 'Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] as const;

export function difficultyLabel(d: number): string {
  return DIFFICULTY_LABELS[Math.max(0, Math.min(DIFFICULTY_LABELS.length - 1, Math.round(d)))] ?? 'Pre-K';
}

/**
 * Validates catalog integrity (unique ids, known prerequisites, no cycles).
 * Run in tests; cheap enough to run at startup in development.
 */
export function validateCatalog(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const s of SKILLS) {
    if (ids.has(s.id)) problems.push(`Duplicate skill id ${s.id}`);
    ids.add(s.id);
    for (const p of s.prerequisites) if (!skillIndex.has(p)) problems.push(`${s.id} → unknown prerequisite ${p}`);
    if (s.standards.length === 0) problems.push(`${s.id} has no standards alignment`);
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      problems.push(`Prerequisite cycle: ${[...path, id].join(' → ')}`);
      return;
    }
    visiting.add(id);
    for (const p of skillIndex.get(id)?.prerequisites ?? []) visit(p, [...path, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const s of SKILLS) visit(s.id, []);
  return problems;
}
