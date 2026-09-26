import type { DayString, ReportAudience, Timestamp } from '../types';

export interface ReportStat {
  label: string;
  value: string;
  detail?: string;
}

export interface ReportBook {
  title: string;
  author: string;
  dateCompleted?: DayString;
  rating?: number;
  mode: string;
  favoritePart?: string;
  notes?: string;
}

export interface ReportDomainSection {
  domainId: string;
  name: string;
  color: string;
  descriptor: string;
  workingLabel: string;
  evidenceCount: number;
  advanced: { skillName: string; childName: string; to: string }[];
  highlights: string[];
  standards: string[];
}

export interface ReportHighlight {
  date: DayString;
  statement: string;
  domainName: string;
  independence: string;
  source: string;
}

export interface ReportContent {
  childName: string;
  audience: ReportAudience;
  periodLabel: string;
  periodStart: DayString;
  periodEnd: DayString;
  generatedAt: Timestamp;
  headline: string;
  stats: ReportStat[];
  narrative: string[];
  reading: { completed: ReportBook[]; inProgress: { title: string; progress: string }[]; comprehension: string[] };
  domains: ReportDomainSection[];
  highlights: ReportHighlight[];
  activities: { date: DayString; title: string; domains: string[]; minutes?: number; mediaIds: string[] }[];
  milestones: { date: DayString; title: string; icon: string }[];
  nextSteps: { title: string; rationale: string; idea: string }[];
  mediaIds: string[];
  disclaimer: string;
}
