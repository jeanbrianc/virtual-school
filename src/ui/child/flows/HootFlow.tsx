/**
 * Professor Hoot's library conversation — the core loop:
 * greet → pick the finished book → story chat (adaptive comprehension with a
 * gentle scaffold ladder) → star rating → favorite part → onto the shelf.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { effectiveLevel, masteryRank } from '../../../domain/mastery/masteryEngine';
import { LessonRun } from '../../../domain/lessons/engine';
import { storyChatLesson } from '../../../domain/lessons/storyChat';
import { GENERIC_FEELINGS, getCatalogBook, selectQuestions } from '../../../domain/reading/bookCatalog';
import { searchCatalogSync } from '../../../domain/reading/bookMetadata';
import { TEACHERS, pickLine, teacherOpening } from '../../../domain/teachers/teachers';
import type { Book, MasteryRecord, TranscriptLine } from '../../../domain/types';
import { hashString } from '../../../domain/util/random';
import type { CompleteBookInput } from '../../../services/readingService';
import { BookCover } from '../../shared/BookCover';
import { Icon } from '../../shared/Icon';
import { Choices, DialogueShell, type Speech } from '../DialogueShell';

type Step =
  | { kind: 'menu' }
  | { kind: 'pick'; mode: 'finish' | 'more' }
  | { kind: 'newBook' }
  | { kind: 'questions' }
  | { kind: 'feeling' }
  | { kind: 'rate' }
  | { kind: 'favorite' }
  | { kind: 'progress' }
  | { kind: 'bye'; line: string };

export interface HootFlowProps {
  childName: string;
  books: Book[];
  mastery: MasteryRecord[];
  visitsToday: number;
  speech: Speech;
  playSfx: (name: 'correct' | 'tryAgain' | 'click' | 'pageFlip' | 'sparkle') => void;
  onFinishBook: (input: Omit<CompleteBookInput, 'source'>) => void;
  onReadMore: (bookId: string, chapters: number, transcript: TranscriptLine[], startedAt: string) => Promise<string>;
  onClose: (transcript: TranscriptLine[], startedAt: string) => void;
  /** Optional voice answer (only when a parent enabled speech input and the browser supports it). */
  listen?: () => Promise<string | null>;
}

const FEELING_ICONS: Record<string, string> = {
  Funny: '😄',
  Exciting: '🤩',
  Cozy: '🧸',
  Surprising: '😮',
  'A little sad': '🥲',
  Mysterious: '🕵️',
};

export function HootFlow(props: HootFlowProps) {
  const { speech, playSfx } = props;
  const startedAt = useRef(new Date().toISOString());
  const transcript = useRef<TranscriptLine[]>([]);
  const [listening, setListening] = useState(false);
  const seed = useRef(hashString(startedAt.current));
  const [step, setStep] = useState<Step>({ kind: 'menu' });
  const [book, setBook] = useState<Book | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newBookInput, setNewBookInput] = useState<{ title: string; author?: string; catalogId?: string } | null>(null);
  const [line, setLine] = useState<string>('');
  const [mood, setMood] = useState<'happy' | 'thinking' | 'cheer'>('happy');
  const [choiceState, setChoiceState] = useState<Record<string, 'right' | 'soft' | 'disabled'>>({});
  const [rating, setRating] = useState(0);
  const [feeling, setFeeling] = useState<string | undefined>();
  const [chapters, setChapters] = useState(1);
  const [busy, setBusy] = useState(false);
  const runRef = useRef<LessonRun | null>(null);
  const [, force] = useState(0);

  const log = (speaker: TranscriptLine['speaker'], text: string) => transcript.current.push({ speaker, text, at: new Date().toISOString() });
  const say = (text: string, m: typeof mood = 'happy') => {
    setLine(text);
    setMood(m);
    log('teacher', text);
  };

  const reading = props.books.filter((b) => b.status === 'reading');
  const upNext = props.books.filter((b) => b.status === 'up_next');
  const completedCount = props.books.filter((b) => b.status === 'completed').length;
  const deeper = masteryRank(effectiveLevel(props.mastery.find((m) => m.skillId === 'read.key-details'))) >= masteryRank('proficient');

  const opening = useMemo(() => {
    const current = reading[0];
    return teacherOpening(
      'hoot',
      {
        childName: props.childName,
        visitsToday: props.visitsToday,
        booksCompleted: completedCount,
        ...(current ? { currentBookTitle: current.title } : {}),
        ...(current?.totalChapters ? { currentBookProgress: `Last time you were on chapter ${current.chaptersRead ?? 0}.` } : {}),
      },
      seed.current,
    ).join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Greeting is part of the parent-visible transcript.
    transcript.current.push({ speaker: 'teacher', text: opening, at: new Date().toISOString() });
  }, [opening]);
  const currentLine = line === '' ? opening : line;

  const close = () => props.onClose(transcript.current, startedAt.current);

  const startQuestions = (b: Book | null, catalogId: string | undefined) => {
    const cat = getCatalogBook(catalogId);
    if (cat && cat.questions.length > 0) {
      const qs = selectQuestions(cat, deeper, 2);
      runRef.current = new LessonRun(storyChatLesson(cat, qs), 0, seed.current);
      const first = runRef.current.currentProblem();
      setStep({ kind: 'questions' });
      setChoiceState({});
      say(`Oh, ${b?.title ?? cat.title}! What a wonderful story. Let’s chat about it. ${first?.prompt ?? ''}`, 'thinking');
    } else {
      setStep({ kind: 'feeling' });
      say('How wonderful! How did the story make you feel?', 'thinking');
    }
  };

  const chooseBook = (b: Book) => {
    playSfx('pageFlip');
    log('child', b.title);
    setBook(b);
    if (step.kind === 'pick' && step.mode === 'more') {
      setStep({ kind: 'progress' });
      setChapters(1);
      say(b.totalChapters ? `How many chapters of ${b.title} did you read?` : `How many pages of ${b.title} did you read?`, 'thinking');
      return;
    }
    startQuestions(b, b.catalogId);
  };

  const answer = (choiceId: string) => {
    const run = runRef.current;
    const problem = run?.currentProblem();
    if (!run || !problem || busy) return;
    const label = problem.choices.find((c) => c.id === choiceId)?.label ?? choiceId;
    log('child', label);
    const fb = run.answer(choiceId);
    if (fb.correct) {
      playSfx('correct');
      setChoiceState({ [choiceId]: 'right' });
      say(fb.message, 'cheer');
    } else if (fb.problemFinished) {
      playSfx('tryAgain');
      setChoiceState({ [problem.answerId]: 'right' });
      say(`${fb.message} Hoo! That was a tricky one.`, 'happy');
    } else {
      playSfx('tryAgain');
      setChoiceState((s) => ({ ...s, [choiceId]: 'disabled' }));
      say(fb.message, 'thinking');
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setChoiceState({});
      if (run.isComplete) {
        setStep({ kind: 'rate' });
        say('You really understood that story! How many stars would you give it?', 'cheer');
      } else {
        const next = run.currentProblem();
        say(next?.prompt ?? '', 'thinking');
      }
      force((n) => n + 1);
    }, 2300);
  };

  const finish = (favoritePart?: string) => {
    const b = book;
    const run = runRef.current;
    say(pickLine(['Hoo-hoo! Let’s put it on your shelf!', 'Onto your bookshelf it goes!'], seed.current), 'cheer');
    playSfx('sparkle');
    const input: Omit<CompleteBookInput, 'source'> = {
      ...(b ? { bookId: b.id } : {}),
      ...(!b && newBookInput
        ? {
            newBook: {
              title: newBookInput.title,
              ...(newBookInput.author ? { author: newBookInput.author } : {}),
              ...(newBookInput.catalogId ? { catalogId: newBookInput.catalogId } : {}),
              needsParentReview: !newBookInput.catalogId,
            },
          }
        : {}),
      answers: run ? [...run.attempts] : [],
      ...(run ? { problems: run.problemIndex } : {}),
      ...(rating ? { rating } : {}),
      ...(favoritePart ? { favoritePart } : {}),
      ...(feeling ? { feeling } : {}),
      startedAt: startedAt.current,
      transcript: [...transcript.current],
    };
    window.setTimeout(() => props.onFinishBook(input), 900);
  };

  // ── Render per step ──────────────────────────────────────────────────
  let content: React.ReactNode = null;
  switch (step.kind) {
    case 'menu':
      content = (
        <Choices
          items={[
            { id: 'finish', label: 'I finished a book!', icon: '📖', tone: 'primary' },
            { id: 'more', label: 'I read some more', icon: '🔖' },
            { id: 'bye', label: 'Bye for now', icon: '👋' },
          ]}
          onPick={(id) => {
            playSfx('click');
            if (id === 'bye') {
              log('child', 'Bye for now');
              close();
              return;
            }
            log('child', id === 'finish' ? 'I finished a book!' : 'I read some more');
            if (id === 'more' && reading.length + upNext.length === 0) {
              say('Hmm, I don’t see a book you’re reading right now. Ask a grown-up to add one!', 'thinking');
              return;
            }
            setStep({ kind: 'pick', mode: id === 'finish' ? 'finish' : 'more' });
            say(id === 'finish' ? 'Wonderful! Which book did you finish?' : 'Splendid! Which book were you reading?', 'happy');
          }}
        />
      );
      break;
    case 'pick': {
      const list = [...reading, ...upNext].slice(0, step.mode === 'finish' ? 5 : 6);
      content = (
        <div className="book-pick" role="list">
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              className="book-pick-item"
              onClick={() => chooseBook(b)}
              role="listitem"
              data-testid={`pick-book-${b.catalogId ?? b.id}`}
            >
              <BookCover title={b.title} author={b.author} cover={b.cover} width={92} />
              <span className="book-pick-title">{b.title}</span>
              {b.status === 'reading' && b.totalChapters ? <span className="book-pick-tag">Chapter {b.chaptersRead ?? 0}</span> : null}
            </button>
          ))}
          {step.mode === 'finish' && (
            <button
              type="button"
              className="book-pick-item book-pick-other"
              onClick={() => {
                playSfx('click');
                setStep({ kind: 'newBook' });
                say('A new one! What is the book called? You can ask a grown-up to help you type it.', 'thinking');
              }}
            >
              <span className="book-pick-plus">
                <Icon name="plus" size={36} />
              </span>
              <span className="book-pick-title">A different book</span>
            </button>
          )}
        </div>
      );
      break;
    }
    case 'newBook': {
      const suggestions = newTitle.trim().length >= 3 ? searchCatalogSync(newTitle, 3) : [];
      content = (
        <form
          className="new-book"
          onSubmit={(e) => {
            e.preventDefault();
            const title = newTitle.trim();
            if (!title) return;
            log('child', title);
            setNewBookInput({ title });
            setBook(null);
            startQuestions(null, undefined);
          }}
        >
          <input
            className="big-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Book title"
            aria-label="Book title"
            autoFocus
          />
          {suggestions.length > 0 && (
            <div className="suggest-row">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="suggest-chip"
                  onClick={() => {
                    log('child', s.title);
                    setNewBookInput({ title: s.title, author: s.author, catalogId: s.id });
                    setBook(null);
                    startQuestions(null, s.id);
                  }}
                >
                  <BookCover title={s.title} author={s.author} cover={s.cover} width={40} /> {s.title}
                </button>
              ))}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-big" disabled={!newTitle.trim()}>
            That’s my book! <Icon name="arrowRight" />
          </button>
        </form>
      );
      break;
    }
    case 'questions': {
      const p = runRef.current?.currentProblem();
      content = p ? <Choices items={p.choices.map((c) => ({ id: c.id, label: c.label }))} onPick={answer} state={choiceState} columns={1} /> : null;
      break;
    }
    case 'feeling':
      content = (
        <Choices
          columns={3}
          items={GENERIC_FEELINGS.map((f) => ({ id: f, label: f, icon: FEELING_ICONS[f] ?? '📘' }))}
          onPick={(f) => {
            playSfx('click');
            log('child', f);
            setFeeling(f);
            setStep({ kind: 'rate' });
            say(`${f}! I love that. How many stars would you give it?`, 'cheer');
          }}
        />
      );
      break;
    case 'rate':
      content = (
        <div className="star-row" role="radiogroup" aria-label="Rate the book">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className={`star-btn ${n <= rating ? 'on' : ''}`}
              data-testid={`star-${n}`}
              onClick={() => {
                playSfx('sparkle');
                setRating(n);
                log('child', `Rating: ${'★'.repeat(n)}`);
                window.setTimeout(() => {
                  const cat = getCatalogBook(book?.catalogId ?? newBookInput?.catalogId);
                  if (cat?.moments.length) {
                    setStep({ kind: 'favorite' });
                    say(n >= 4 ? 'Hoo-ray! What was your favorite part?' : 'Thank you for telling me! What part did you like best?', 'happy');
                  } else finish();
                }, 500);
              }}
            >
              <Icon name="star" size={46} />
            </button>
          ))}
        </div>
      );
      break;
    case 'favorite': {
      const cat = getCatalogBook(book?.catalogId ?? newBookInput?.catalogId);
      const listen = props.listen;
      content = (
        <>
          {listen && (
            <button
              type="button"
              className={`mic-btn ${listening ? 'on' : ''}`}
              disabled={listening}
              onClick={() => {
                setListening(true);
                void listen()
                  .then((heard) => {
                    if (heard && heard.trim()) {
                      log('child', heard.trim());
                      finish(heard.trim());
                      setStep({ kind: 'bye', line: '' });
                    } else {
                      say('Hoo? I didn’t quite hear that. You can tap one instead!', 'thinking');
                    }
                  })
                  .finally(() => setListening(false));
              }}
            >
              <Icon name="mic" size={28} /> {listening ? 'Listening…' : 'Tell Professor Hoot'}
            </button>
          )}
          <Choices
            columns={2}
            items={[...(cat?.moments ?? []).map((m) => ({ id: m, label: m })), { id: '__skip', label: 'Something else!', icon: '✨' }]}
            onPick={(m) => {
              playSfx('click');
              log('child', m === '__skip' ? 'Something else' : m);
              finish(m === '__skip' ? undefined : m);
              setStep({ kind: 'bye', line: '' });
            }}
          />
        </>
      );
      break;
    }
    case 'progress':
      content = (
        <div className="stepper">
          <button type="button" className="stepper-btn" aria-label="Fewer" onClick={() => setChapters((c) => Math.max(1, c - 1))}>
            <Icon name="minus" size={32} />
          </button>
          <div className="stepper-value" aria-live="polite">
            <span>{chapters}</span>
            <small>{book?.totalChapters ? (chapters === 1 ? 'chapter' : 'chapters') : chapters === 1 ? 'page' : 'pages'}</small>
          </div>
          <button type="button" className="stepper-btn" aria-label="More" onClick={() => setChapters((c) => Math.min(book?.totalChapters ? 10 : 200, c + 1))}>
            <Icon name="plus" size={32} />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-big"
            disabled={busy}
            onClick={async () => {
              if (!book) return;
              setBusy(true);
              log('child', `${chapters} ${book.totalChapters ? 'chapters' : 'pages'}`);
              const reply = await props.onReadMore(book.id, chapters, transcript.current, startedAt.current);
              setBusy(false);
              setStep({ kind: 'bye', line: reply });
              say(reply, 'cheer');
              playSfx('sparkle');
            }}
          >
            Done! <Icon name="check" />
          </button>
        </div>
      );
      break;
    case 'bye':
      content = step.line ? <Choices items={[{ id: 'bye', label: 'Bye, Professor Hoot!', icon: '👋', tone: 'primary' }]} onPick={close} /> : null;
      break;
  }

  return (
    <DialogueShell teacher="hoot" line={currentLine} mood={mood} onClose={close} speech={speech} wide={step.kind === 'pick'}>
      {content}
    </DialogueShell>
  );
}

export const HOOT = TEACHERS.hoot;
