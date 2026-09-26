export type DomainId = 'reading' | 'math' | 'science' | 'writing' | 'vocabulary' | 'reasoning' | 'lifeSkills' | 'creativity';

export type Framework = 'CCSS-ELA' | 'CCSS-M' | 'CCSS-MP' | 'NGSS' | 'NGSS-DCI' | 'NCAS' | 'CASEL' | 'ELOF' | 'Family';

export interface StandardRef {
  framework: Framework;
  code: string;
  description: string;
}

export interface Domain {
  id: DomainId;
  name: string;
  /** Kid-facing name — never a grade label. */
  childName: string;
  color: string;
  primary: boolean;
  description: string;
}

export interface Strand {
  id: string;
  domainId: DomainId;
  name: string;
  description: string;
}

/**
 * Difficulty is an internal ordinal roughly tracking when a concept is
 * typically introduced: 0 = Pre-K, 1 = K, 2 = Grade 1, 3 = Grade 2,
 * 4 = Grade 3, 5 = Grade 4. It is used for sequencing and "just beyond
 * mastery" recommendations and is shown only to parents.
 */
export type Difficulty = 0 | 1 | 2 | 3 | 4 | 5;

export interface Skill {
  id: string;
  strandId: string;
  domainId: DomainId;
  name: string;
  /** Verb phrase used in parent evidence statements ("add within 20"). */
  can: string;
  /** Kid-facing label ("Rocket Math"), never shows standards codes. */
  childName: string;
  difficulty: Difficulty;
  prerequisites: string[];
  standards: StandardRef[];
  /** World-growth topics this skill feeds (plants, space, dinosaurs…). */
  topics: string[];
  lessonIds: string[];
  /** A concrete off-screen idea parents can try. */
  activityIdea: string;
}
