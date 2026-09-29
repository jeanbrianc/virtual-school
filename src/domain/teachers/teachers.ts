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
  /** Voice hints for the computer's built-in text-to-speech (pitch/rate). */
  voice: { pitch: number; rate: number };
  /**
   * The natural AI voice (OpenAI text-to-speech, used only when a parent turns
   * natural voices on): a built-in voice name plus how to perform it.
   */
  naturalVoice: { voice: string; style: string };
  /** The very first meeting: the teacher introduces themselves and their room. */
  introductions: string[];
  /** Later visits (they have met before). */
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
    naturalVoice: {
      voice: 'cedar',
      style:
        'You are Professor Hoot, a kind, wise old owl who teaches reading to a three-year-old girl. Speak warmly and gently, a little slowly and very clearly, with delighted enthusiasm about books, like a favorite grandpa at story time. Say "hoo-hoo" as a soft, happy owl call.',
    },
    introductions: [
      'Hoo-hoo! Hello there — you must be {name}! I’m Professor Hoot, and this is the library, where stories live. Whenever you finish a book, come and tell me about it. We’ll chat about the story, and then it flies onto your very own bookshelf!',
    ],
    greetings: ['Hoo-hoo! Hello again, {name}!', 'Why, if it isn’t my favorite reader! Hoo-hoo!', 'Hello, {name}! The books have been whispering about you.'],
    returnGreetings: ['Hoo-hoo, welcome back!', 'Back again? Wonderful — the library missed you!'],
    farewells: ['Happy reading, {name}!', 'Off you go — adventures are waiting between the pages!', 'Hoo-hoo! See you soon!'],
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
    naturalVoice: {
      voice: 'verse',
      style:
        'You are Digit, a cheerful little helper robot who loves counting and rockets, talking with a three-year-old girl. Speak brightly and bouncily with crisp, precise words and a light, playful robot rhythm. Say "beep boop" like a happy sound effect. Keep it clear and easy to follow.',
    },
    introductions: ['Beep boop! A new friend! Hello, {name} — I’m Digit, the math robot. I love counting, puzzles and rockets!'],
    greetings: ['Beep boop! Hello, {name}!', 'Greetings, Captain {name}! Systems ready for math!', 'Beep! My number sensors detect… {NAME}!'],
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
    naturalVoice: {
      voice: 'marin',
      style:
        'You are Nova, an adventurous red panda scientist talking with a three-year-old girl. Speak with bright curiosity and excitement, full of wonder, friendly and very clear, not too fast.',
    },
    introductions: [
      'Oh, hello! You must be {name}. I’m Nova, and this is my science lab. Scientists ask questions and then test them to find out the answers!',
    ],
    greetings: ['{name}! Perfect timing — I was just wondering about something!', 'Hi hi! Want to discover something amazing?'],
    returnGreetings: ['You’re back! I have SO many new questions!', 'Welcome back, fellow scientist!'],
    farewells: ['Keep wondering, {name}!', 'Stay curious! See you in the lab!'],
    praise: ['Now THAT’S scientific thinking!', 'Ooh, great observation!', 'You think like a real scientist!'],
  },
};

/** Fills the `{name}` / `{NAME}` placeholders in teacher and lesson lines. */
export function personalize(text: string, name: string): string {
  return text.replace(/\{NAME\}/g, name.toUpperCase()).replace(/\{name\}/g, name);
}

export function pickLine(lines: readonly string[], seed: number): string {
  if (lines.length === 0) return '';
  return lines[Math.abs(seed) % lines.length] ?? lines[0] ?? '';
}

/** Memory-aware opener: teachers remember basic progress, nothing more. */
export interface TeacherMemory {
  /** The learner's first name, substituted into greetings. */
  childName: string;
  /** True until the child has had a conversation with this teacher. */
  firstMeeting?: boolean;
  visitsToday: number;
  lastLessonSummary?: string;
  currentBookTitle?: string;
  currentBookProgress?: string;
  booksCompleted: number;
}

export function teacherOpening(id: TeacherId, memory: TeacherMemory, seed: number): string[] {
  const t = TEACHERS[id];
  if (memory.firstMeeting) {
    const intro = [pickLine(t.introductions, seed)];
    if (id === 'hoot')
      intro.push(
        memory.booksCompleted > 0 ? 'I see some books on your shelf already. What shall we do today?' : 'Your shelf is empty — shall we start filling it?',
      );
    return intro.map((l) => personalize(l, memory.childName));
  }
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
  return lines.map((l) => personalize(l, memory.childName));
}
