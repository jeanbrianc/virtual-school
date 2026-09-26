/**
 * Teacher profiles and bounded, lesson-aware dialogue.
 *
 * Teachers never free-chat. Every line comes from these scripts (or, in the
 * future, from a DialogueProvider that must return one of a small set of
 * allowed intents — see docs/ARCHITECTURE.md → "Teacher dialogue").
 */
export type TeacherId = 'hoot' | 'digit' | 'nova';

export interface TeacherProfile {
  id: TeacherId;
  name: string;
  subject: string;
  species: string;
  personality: string;
  color: string;
  accent: string;
  /** Voice hints for text-to-speech (pitch/rate), used only if read-aloud is on. */
  voice: { pitch: number; rate: number };
  greetings: string[];
  returnGreetings: string[];
  farewells: string[];
  praise: string[];
}

export const TEACHERS: Record<TeacherId, TeacherProfile> = {
  hoot: {
    id: 'hoot',
    name: 'Professor Hoot',
    subject: 'Reading & Storytelling',
    species: 'Great horned owl',
    personality: 'Warm, curious, and wildly enthusiastic about books.',
    color: '#8b6b4a',
    accent: '#e8b04b',
    voice: { pitch: 0.85, rate: 0.95 },
    greetings: [
      'Hoo-hoo! Welcome to the library, Izzy!',
      'Why, if it isn’t my favorite reader! Hoo-hoo!',
      'Hello, Izzy! The books have been whispering about you.',
    ],
    returnGreetings: ['Hoo-hoo, welcome back!', 'Back again? Wonderful — the library missed you!'],
    farewells: ['Happy reading, Izzy!', 'Off you go — adventures are waiting between the pages!', 'Hoo-hoo! See you soon!'],
    praise: ['Magnificent thinking!', 'What a clever reader you are!', 'Hoo-hoo! Splendid!'],
  },
  digit: {
    id: 'digit',
    name: 'Digit',
    subject: 'Math',
    species: 'Friendly helper robot',
    personality: 'Playful, precise, and delighted by puzzles and counting.',
    color: '#4aa3a8',
    accent: '#ffcf5c',
    voice: { pitch: 1.35, rate: 1.05 },
    greetings: ['Beep boop! Hello, Izzy!', 'Greetings, Captain Izzy! Systems ready for math!', 'Beep! My number sensors detect… IZZY!'],
    returnGreetings: ['Beep boop! You’re back! My circuits are happy!', 'Welcome back, space helper!'],
    farewells: ['Beep boop, bye for now!', 'Mission complete. See you next launch!'],
    praise: ['Calculations correct! Beep!', 'Excellent counting, Captain!', 'Boop-tastic!'],
  },
  nova: {
    id: 'nova',
    name: 'Nova',
    subject: 'Science',
    species: 'Red panda scientist',
    personality: 'Adventurous, experimental, always asking “why?”',
    color: '#c65d3b',
    accent: '#7fc8c0',
    voice: { pitch: 1.15, rate: 1.0 },
    greetings: ['Izzy! Perfect timing — I was just wondering about something!', 'Hi hi! Want to discover something amazing?'],
    returnGreetings: ['You’re back! I have SO many new questions!', 'Welcome back, fellow scientist!'],
    farewells: ['Keep wondering, Izzy!', 'Stay curious! See you in the lab!'],
    praise: ['Now THAT’S scientific thinking!', 'Ooh, great observation!', 'You think like a real scientist!'],
  },
};

export function pickLine(lines: readonly string[], seed: number): string {
  if (lines.length === 0) return '';
  return lines[Math.abs(seed) % lines.length] ?? lines[0] ?? '';
}

/** Memory-aware opener: teachers remember basic progress, nothing more. */
export interface TeacherMemory {
  visitsToday: number;
  lastLessonSummary?: string;
  currentBookTitle?: string;
  currentBookProgress?: string;
  booksCompleted: number;
}

export function teacherOpening(id: TeacherId, memory: TeacherMemory, seed: number): string[] {
  const t = TEACHERS[id];
  const lines = [pickLine(memory.visitsToday > 0 ? t.returnGreetings : t.greetings, seed)];
  if (id === 'hoot') {
    if (memory.currentBookTitle) {
      lines.push(`How is ${memory.currentBookTitle} going? ${memory.currentBookProgress ?? ''}`.trim());
    } else if (memory.booksCompleted > 0) {
      lines.push(`You’ve read ${memory.booksCompleted} book${memory.booksCompleted === 1 ? '' : 's'} so far. What shall we do today?`);
    }
  } else if (memory.lastLessonSummary) {
    lines.push(memory.lastLessonSummary);
  }
  return lines;
}
