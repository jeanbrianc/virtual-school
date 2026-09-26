import type { ProgressSnapshot } from '../progress/snapshot';
import { REWARDS, type RewardDefinition, type RewardRule } from './catalog';

export interface RuleProgress {
  current: number;
  target: number;
  fraction: number;
  met: boolean;
}

export function ruleProgress(rule: RewardRule, snap: ProgressSnapshot): RuleProgress {
  let current = 0;
  switch (rule.type) {
    case 'books':
      current = snap.booksCompleted;
      break;
    case 'topic':
      current = snap.topicCounts[rule.topic] ?? 0;
      break;
    case 'lesson':
      current = snap.lessonCompletions[rule.lessonId] ?? 0;
      break;
    case 'artworks':
      current = snap.artworks;
      break;
    case 'masteredInDomain':
      current = snap.masteredByDomain[rule.domainId] ?? 0;
      break;
  }
  const target = rule.count;
  return { current, target, fraction: Math.min(1, current / target), met: current >= target };
}

/** Rewards whose rules are met but which haven't been unlocked yet (catalog order). */
export function evaluateNewRewards(snap: ProgressSnapshot, unlocked: ReadonlySet<string>): RewardDefinition[] {
  return REWARDS.filter((r) => !unlocked.has(r.id) && ruleProgress(r.rule, snap).met);
}

export interface UpcomingReward {
  reward: RewardDefinition;
  progress: RuleProgress;
}

/** The closest not-yet-earned rewards — used for gentle "next surprise" hints. */
export function upcomingRewards(snap: ProgressSnapshot, unlocked: ReadonlySet<string>, limit = 4): UpcomingReward[] {
  return REWARDS.filter((r) => !unlocked.has(r.id))
    .map((reward) => ({ reward, progress: ruleProgress(reward.rule, snap) }))
    .filter((u) => !u.progress.met)
    .sort((a, b) => b.progress.fraction - a.progress.fraction || a.progress.target - b.progress.target)
    .slice(0, limit);
}
