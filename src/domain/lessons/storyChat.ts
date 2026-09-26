/**
 * Story Chat — Professor Hoot's book conversation. Wraps a book's question
 * bank as a lesson so comprehension answers flow through the same scaffold
 * ladder and evidence pipeline as math and science.
 */
import type { CatalogBook, ComprehensionQuestion } from '../reading/bookCatalog';
import { shuffle } from '../util/random';
import type { LessonDefinition, Problem } from './types';

const DIFFICULTY: Record<ComprehensionQuestion['type'], number> = {
  detail: 2,
  character: 2,
  sequence: 2,
  vocab: 3,
  feelings: 4,
  inference: 4,
  theme: 4,
};

export function questionToProblem(q: ComprehensionQuestion, order: number[]): Problem {
  const choices = order.map((i) => ({ id: `c${i}`, label: q.choices[i] ?? '' }));
  return {
    id: q.id,
    skillId: q.skillId,
    ...(q.type === 'sequence' ? { alsoSkills: ['read.narration'] } : {}),
    tier: 0,
    kind: 'answer',
    prompt: q.prompt,
    visual: { type: 'none' },
    choices,
    answerId: `c${q.answerIndex}`,
    hints: [q.hint, 'Let’s picture that part of the story together…'],
    model: q.explain,
    success: `Hoo-hoo, yes! ${q.explain}`,
    difficulty: DIFFICULTY[q.type],
    meta: { questionType: q.type },
  };
}

export function storyChatLesson(book: CatalogBook, questions: ComprehensionQuestion[]): LessonDefinition {
  return {
    id: 'story-chat',
    teacherId: 'hoot',
    title: `Story Chat: ${book.title} (comprehension conversation)`,
    childTitle: 'Story Chat',
    completeTitle: 'Story Chat Complete! 📖',
    intro: [],
    outro: '',
    rounds: questions.length,
    tiers: [{ skillId: 'read.key-details', label: 'Story conversation' }],
    ladder: ['hint', 'alternate'],
    generateRound: (_tier, rng, round) => {
      const q = questions[round];
      if (!q) return [];
      return [questionToProblem(q, shuffle(rng, q.choices.map((_, i) => i)))];
    },
  };
}
