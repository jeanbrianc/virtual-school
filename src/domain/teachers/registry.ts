import type { DomainId } from '../curriculum/types';

export interface TeacherRegistration {
  domains: readonly DomainId[];
  local: { questions: readonly string[]; shares: readonly string[]; likes: string; unclear: string };
  activity: { kind: 'reading' } | { kind: 'lesson'; lessonId: string };
  scene: { x: number; z: number; model: 'owl' | 'robot' | 'panda' | 'fox'; icon: string };
  room: string;
  startLabel: string;
  completionIcon: string;
  celebration: { icon: string; anchor: 'rocket' | 'aquarium' | 'pippa'; message: string };
}

/** Stable IDs are persisted. Profiles and scene factories must implement every entry. */
export const TEACHER_REGISTRY = {
  hoot: {
    local: {
      questions: ['What a wonderful question! Books are full of answers — let’s find one about it.', 'Hoo! I love questions. What do you think?'],
      shares: ['Hoo-hoo! Tell me more!', 'How wonderful! What happened next?'],
      likes: 'You love {likes}? Hoo-hoo, so do I!',
      unclear: 'Hoo? Could you say that again?',
    },
    domains: ['reading', 'vocabulary'],
    activity: { kind: 'reading' },
    scene: { x: -8.3, z: -5.2, model: 'owl', icon: '🦉' },
    room: 'the library, where you help the learner talk about books so they can go on the bookshelf',
    startLabel: 'Let’s read!',
    completionIcon: '📚',
    celebration: { icon: '📚', anchor: 'rocket', message: 'You explored a story!' },
  },
  digit: {
    local: {
      questions: ['Beep! Great question! My circuits say: let’s count and find out!', 'Ooh, a puzzle! Let’s figure it out together.'],
      shares: ['Beep boop! Tell me more!', 'My sensors say that’s very interesting! Tell me more!'],
      likes: 'You love {likes}? Beep boop, so do I!',
      unclear: 'Beep? My sensors missed that. Can you say it again?',
    },
    domains: ['math', 'reasoning'],
    activity: { kind: 'lesson', lessonId: 'moon-rocks' },
    scene: { x: 8.3, z: 4.4, model: 'robot', icon: '🤖' },
    room: 'the math corner, where you rescue moon rocks by counting, adding and sharing',
    startLabel: 'Let’s rescue them!',
    completionIcon: '🪨',
    celebration: { icon: '🚀', anchor: 'rocket', message: 'You helped Digit on another moon mission.' },
  },
  pippa: {
    domains: ['creativity', 'reasoning'],
    activity: { kind: 'lesson', lessonId: 'patterns-shapes' },
    scene: { x: -3.6, z: 4.4, model: 'fox', icon: '🎨' },
    room: 'the shape studio, where you copy and extend patterns and make a design',
    startLabel: 'Let’s make shapes!',
    completionIcon: '🎨',
    celebration: { icon: '🎨', anchor: 'pippa', message: 'Pippa enjoyed exploring shapes with you!' },
    local: {
      questions: ['A pattern repeats a little group of shapes. What shapes can you notice?', 'You can try a different shape and see how your design changes.'],
      shares: ['Tell me about the shapes you chose!', 'You can make a design in your own way.'],
      likes: 'You love {likes}? Let’s imagine a shape design about it!',
      unclear: 'Shall we copy a shape pattern or make a design?',
    },
  },
  nova: {
    local: {
      questions: [
        'Ooh, what a great question! Scientists find out by testing. What do you think the answer is?',
        'I wonder that too! Let’s be scientists and find out.',
      ],
      shares: ['Ooh, interesting! Tell me more!', 'Really? What happened next?'],
      likes: 'You love {likes}? Me too! That’s so interesting.',
      unclear: 'Hmm? Can you say that one more time?',
    },
    domains: ['science'],
    activity: { kind: 'lesson', lessonId: 'sink-float' },
    scene: { x: 8.2, z: -5.4, model: 'panda', icon: '🔬' },
    room: 'the science lab, where you test which things sink or float',
    startLabel: 'Let’s investigate!',
    completionIcon: '💧',
    celebration: { icon: '🔬', anchor: 'aquarium', message: 'Nova added a new fish friend to the aquarium to thank you!' },
  },
} as const satisfies Record<string, TeacherRegistration>;
export type TeacherId = keyof typeof TEACHER_REGISTRY;
export const TEACHER_IDS = Object.keys(TEACHER_REGISTRY) as TeacherId[];
export function isTeacherId(id: unknown): id is TeacherId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TEACHER_REGISTRY, id);
}
export function teacherRegistration(id: string): TeacherRegistration | undefined {
  return isTeacherId(id) ? TEACHER_REGISTRY[id] : undefined;
}
const aliases: Record<string, TeacherId> = { rocket: 'digit', tank: 'nova' };
export function teacherForInteraction(id: string): TeacherId | undefined {
  if (isTeacherId(id)) return id;
  return Object.prototype.hasOwnProperty.call(aliases, id) ? aliases[id] : undefined;
}
