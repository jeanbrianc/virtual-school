/**
 * Professor Hoot's library conversation — the core loop:
 * greet → pick the finished book → story chat (adaptive comprehension with a
 * gentle scaffold ladder) → star rating → favorite part → onto the shelf.
 *
 * She can also just *tell* Hoot things — by voice or typing — ("I read Daddy
 * the Goodnight Leelanau book"). Hoot answers, works out which book she means
 * and whether she finished it, and offers the next step as a big button.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { LessonRun } from '../../../domain/lessons/engine';
import { storyChatLesson } from '../../../domain/lessons/storyChat';
import { GENERIC_FEELINGS, getCatalogBook, selectQuestions, type ConversationDepth } from '../../../domain/reading/bookCatalog';
import { recentStoryQuestionIds } from '../../../domain/reading/storySelection';
import { finishedBookGreeting, type BookHistoryStatus } from '../../../domain/reading/hootHistory';
import { generatedCover, searchCatalogSync } from '../../../domain/reading/bookMetadata';
import { readingNote, type TeacherChatReply } from '../../../domain/teachers/chat';
import { TEACHERS, pickLine, teacherOpening } from '../../../domain/teachers/teachers';
import type { Book, Evidence, MasteryRecord, ReadingMode, TranscriptLine } from '../../../domain/types';
import { hashString } from '../../../domain/util/random';
import type { CompleteBookInput } from '../../../services/readingService';
import { BookCover } from '../../shared/BookCover';
import { Icon } from '../../shared/Icon';
import { Choices, DialogueShell, type ChoiceItem, type Speech } from '../DialogueShell';
import { MicButton, TalkBar, useTeacherTalk, type TalkKit } from '../Talk';

type Step =
  | { kind: 'menu' }
  | { kind: 'talk' }
  | { kind: 'pick'; mode: 'finish' | 'more' }
  | { kind: 'newBook'; mode: 'finish' | 'start' }
  | { kind: 'questions' }
  | { kind: 'feeling' }
  | { kind: 'rate' }
  | { kind: 'favorite' }
  | { kind: 'progress' }
  | { kind: 'bye'; line: string };

export interface HootFlowProps {
  childName: string;
  books: Book[];
  /** Omitted by loaded callers; unknown history must never imply a first book. */
  historyStatus?: BookHistoryStatus;
  mastery: MasteryRecord[];
  /** Child-scoped saved evidence; only explicit question-ID markers are read. */
  storyEvidence?: Evidence[];
  /** Set in the gated parent settings; no child-facing difficulty control. */
  conversationDepth?: ConversationDepth;
  visitsToday: number;
  /** True until she has had a conversation with Professor Hoot. */
  firstMeeting: boolean;
  speech: Speech;
  playSfx: (name: 'correct' | 'tryAgain' | 'click' | 'pageFlip' | 'sparkle') => void;
  onFinishBook: (input: Omit<CompleteBookInput, 'source'>) => void;
  onReadMore: (bookId: string, chapters: number, transcript: TranscriptLine[], startedAt: string) => Promise<string>;
  /** She tells Hoot about a book she has started; returns Hoot's reply. */
  onStartBook: (book: { title: string; author?: string; catalogId?: string }, transcript: TranscriptLine[], startedAt: string) => Promise<string>;
  onClose: (transcript: TranscriptLine[], startedAt: string, parentNotes: string[]) => void;
  /** Microphone (when allowed and working) and the teacher conversation service. */
  talk: TalkKit;
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
  const seed = useRef(hashString(startedAt.current));
  const [step, updateStep] = useState<Step>({ kind: 'menu' });
  const generation = useRef(0);
  const mounted = useRef(true);
  const renderGeneration = generation.current;
  const isCurrent = () => mounted.current && generation.current === renderGeneration;
  const [book, setBook] = useState<Book | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newBookInput, setNewBookInput] = useState<{ title: string; author?: string; catalogId?: string } | null>(null);
  const [line, setLine] = useState<string>('');
  const [mood, setMood] = useState<'happy' | 'thinking' | 'cheer'>('happy');
  const [choiceState, setChoiceState] = useState<Record<string, 'right' | 'soft' | 'disabled'>>({});
  const [rating, setRating] = useState(0);
  const ratingRef = useRef(0);
  const locked = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    const token = generation.current;
    timers.current.push(
      setTimeout(() => {
        if (mounted.current && generation.current === token) fn();
      }, ms),
    );
  };
  const invalidate = () => {
    generation.current++;
    props.talk.mic?.stop();
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const setStep = (next: Step) => {
    invalidate();
    updateStep(next);
  };
  const cancelPending = () => {
    invalidate();
    locked.current = false;
    setBusy(false);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, []);
  const [favoriteText, setFavoriteText] = useState('');
  const [narration, setNarration] = useState('');
  const [parentResponse, setParentResponse] = useState('');
  const [aiLine, setAiLine] = useState(false);
  const [feeling, setFeeling] = useState<string | undefined>();
  const [chapters, setChapters] = useState(1);
  const [busy, setBusy] = useState(false);
  const runRef = useRef<LessonRun | null>(null);
  const [, force] = useState(0);
  /** How she read the book, when she told Hoot ("I read it to Daddy"). */
  const readingContext = useRef<{ sessionNote?: string; readingMode?: ReadingMode }>({});
  const [titleLive, setTitleLive] = useState('');
  const [micTrouble, setMicTrouble] = useState('');

  const log = (speaker: TranscriptLine['speaker'], text: string, via?: TranscriptLine['via'], localOnly?: true) =>
    transcript.current.push({ speaker, text, at: new Date().toISOString(), ...(via ? { via } : {}), ...(localOnly ? { localOnly } : {}) });
  const say = (text: string, m: typeof mood = 'happy', via?: TranscriptLine['via']) => {
    setLine(text);
    setAiLine(via === 'ai');
    setMood(m);
    log('teacher', text, via);
  };
  const talk = useTeacherTalk({
    teacher: 'hoot',
    childName: props.childName,
    books: props.books.map((b) => ({ id: b.id, title: b.title, status: b.status })),
    kit: props.talk,
    transcript: () => transcript.current,
    log,
    generation: () => generation.current,
  });
  const mic = props.talk.mic;
  const typeHint = mic ? 'Tap the microphone and say it — or type it.' : 'You can ask a grown-up to help you type it.';

  const reading = props.books.filter((b) => b.status === 'reading');
  const upNext = props.books.filter((b) => b.status === 'up_next');
  const completedCount = props.books.filter((b) => b.status === 'completed').length;
  const recentQuestionIds = useMemo(() => recentStoryQuestionIds(props.books, props.storyEvidence ?? []), [props.books, props.storyEvidence]);

  const opening = useMemo(() => {
    if (props.historyStatus === 'loading') return 'Hello! Your bookshelf is loading. You can tell me about a book.';
    if (props.historyStatus === 'unavailable') return 'Hello! I can’t check your bookshelf right now. You can still tell me about a book.';
    const current = reading[0];
    return teacherOpening(
      'hoot',
      {
        childName: props.childName,
        firstMeeting: props.firstMeeting,
        visitsToday: props.visitsToday,
        booksCompleted: completedCount,
        ...(current ? { currentBookTitle: current.title } : {}),
        ...(current
          ? {
              currentBookProgress:
                current.totalChapters && current.chaptersRead ? `Last time you were on chapter ${current.chaptersRead}.` : 'You just started it!',
            }
          : {}),
      },
      seed.current,
    )
      .concat(props.firstMeeting && props.talk.mic && !props.talk.mic.blocked ? ['You can tap the microphone and just tell me, too!'] : [])
      .join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.books, props.historyStatus, props.firstMeeting]);

  useEffect(() => {
    // Greeting is part of the parent-visible transcript.
    transcript.current.push({ speaker: 'teacher', text: opening, at: new Date().toISOString() });
  }, [opening]);
  const currentLine = line === '' ? opening : line;

  const close = () => {
    cancelPending();
    const notes = [...talk.notes];
    talk.reset();
    props.onClose(transcript.current, startedAt.current, notes);
  };
  const back = () => {
    cancelPending();
    talk.reset();
    setTitleLive('');
    setMicTrouble('');
    runRef.current = null;
    ratingRef.current = 0;
    setRating(0);
    setFeeling(undefined);
    setBook(null);
    setNewBookInput(null);
    setNewTitle('');
    setChoiceState({});
    setFavoriteText('');
    setNarration('');
    setParentResponse('');
    setAiLine(false);
    readingContext.current = {};
    setStep({ kind: 'menu' });
    setLine('');
  };

  const bookFor = (id: string | undefined) => (id ? props.books.find((b) => b.id === id) : undefined);

  /** She said something to Hoot (voice, typing, or a quick-answer button). */
  const tellHoot = async (text: string, via?: 'voice' | 'typed') => {
    if (!isCurrent() || locked.current || busy || talk.thinking) return false;
    if (step.kind !== 'talk') setStep({ kind: 'talk' });
    setMicTrouble('');
    locked.current = true;
    const token = generation.current;
    let reply: TeacherChatReply;
    try {
      reply = await talk.send(text, via);
    } catch {
      if (mounted.current && generation.current === token) {
        locked.current = false;
        say('I couldn’t hear back just now. You can try again or use the library buttons.', 'happy');
      }
      return false;
    }
    if (!mounted.current || generation.current !== token) return false;
    locked.current = false;
    let answer = reply.reply;
    const already = bookFor(reply.book?.existingBookId);
    if (already?.status === 'completed' && reply.intent !== 'safety' && reply.intent !== 'share' && reply.intent !== 'unclear') {
      answer += ` ${already.title} is already on your shelf — reading a favorite again is wonderful!`;
    }
    const m = reply.intent === 'finished_book' || reply.intent === 'read_to_someone' ? 'cheer' : reply.intent === 'question' ? 'thinking' : 'happy';
    say(answer, m, reply.source === 'ai' ? 'ai' : undefined);
    return true;
  };

  /** "Put it on my shelf!" — the book she talked about goes into the usual story chat. */
  const finishFromTalk = () => {
    const t = talk.topic;
    if (!t.book) return;
    playSfx('pageFlip');
    const note = readingNote(props.childName, t);
    readingContext.current = {
      ...(note ? { sessionNote: note } : {}),
      ...(t.readBy ? { readingMode: 'read_aloud' as const } : {}),
    };
    const existing = bookFor(t.book.existingBookId);
    if (existing && existing.status !== 'completed') {
      setBook(existing);
      startQuestions(existing, existing.catalogId);
      return;
    }
    const input = { title: t.book.title, ...(t.book.author ? { author: t.book.author } : {}), ...(t.book.catalogId ? { catalogId: t.book.catalogId } : {}) };
    setNewBookInput(input);
    setBook(null);
    startQuestions(null, input.catalogId);
  };

  /** "Bookmark it" — a book she's in the middle of. */
  const bookmarkFromTalk = () => {
    const t = talk.topic;
    if (!t.book) return;
    const existing = bookFor(t.book.existingBookId);
    if (existing && existing.status !== 'completed') {
      playSfx('pageFlip');
      setBook(existing);
      setStep({ kind: 'progress' });
      setChapters(1);
      say(existing.totalChapters ? `How many chapters of ${existing.title} did you read?` : `How many pages of ${existing.title} did you read?`, 'thinking');
      return;
    }
    void submitNewBook('start', {
      title: t.book.title,
      ...(t.book.author ? { author: t.book.author } : {}),
      ...(t.book.catalogId ? { catalogId: t.book.catalogId } : {}),
    });
  };

  const startQuestions = (b: Book | null, catalogId: string | undefined) => {
    const cat = getCatalogBook(catalogId);
    if (cat && cat.questions.length > 0) {
      const qs = selectQuestions(cat, { depth: props.conversationDepth ?? 'adaptive', mastery: props.mastery, recentQuestionIds }, 2);
      runRef.current = new LessonRun(storyChatLesson(cat, qs), 0, seed.current);
      const first = runRef.current.currentProblem();
      setStep({ kind: 'questions' });
      setChoiceState({});
      say(`Oh, ${b?.title ?? cat.title}! What a wonderful story. Let’s chat about it. ${first?.prompt ?? ''}`, 'thinking');
    } else {
      setStep({ kind: 'feeling' });
      runRef.current = null;
      say('I don’t have checked story questions for this book. You can tell me your own ideas! How did the story make you feel?', 'thinking');
    }
  };

  /** A title she typed or picked: finish it now, or start it as her current book. */
  const submitNewBook = async (mode: 'finish' | 'start', input: { title: string; author?: string; catalogId?: string }) => {
    if (!isCurrent() || locked.current) return;
    log('child', input.title);
    if (mode === 'finish') {
      setNewBookInput(input);
      setBook(null);
      startQuestions(null, input.catalogId);
      return;
    }
    locked.current = true;
    setBusy(true);
    const token = generation.current;
    let reply: string;
    try {
      reply = await props.onStartBook(input, [...transcript.current], startedAt.current);
    } catch {
      if (mounted.current && generation.current === token) {
        locked.current = false;
        setBusy(false);
        say('I couldn’t save that just now. Please try again.', 'happy');
      }
      return;
    }
    if (!mounted.current || generation.current !== token) return;
    locked.current = false;
    setBusy(false);
    playSfx('sparkle');
    setStep({ kind: 'bye', line: reply });
    say(reply, 'cheer');
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
    if (!run || !problem || busy || locked.current) return;
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
    locked.current = true;
    setBusy(true);
    later(() => {
      locked.current = false;
      setBusy(false);
      setChoiceState({});
      if (run.isComplete) {
        setStep({ kind: 'rate' });
        say('Thank you for sharing your thinking! How many stars would you give it?', 'cheer');
      } else {
        const next = run.currentProblem();
        say(next?.prompt ?? '', 'thinking');
      }
      force((n) => n + 1);
    }, 2300);
  };

  const finish = (favoritePart?: string) => {
    if (!isCurrent() || locked.current) return;
    locked.current = true;
    setBusy(true);
    setStep({ kind: 'bye', line: '' });
    const b = book;
    const run = runRef.current;
    const parentPrompt = b?.storyPrompt;
    if (!run) {
      log('system', 'Custom-book reflection: ungraded; book facts and independence were not assessed.');
      if (narration.trim()) log('child', `My narration: ${narration.trim()}`, 'typed');
      if (parentPrompt?.prompt.trim() && parentPrompt.answer.trim()) {
        log('system', `Parent-authored prompt: ${parentPrompt.prompt.trim()} Reference answer: ${parentPrompt.answer.trim()}. Response is ungraded.`);
        if (parentResponse.trim()) log('child', parentResponse.trim(), 'typed');
      }
    }
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
      ...(ratingRef.current ? { rating: ratingRef.current } : {}),
      ...(favoritePart || (!run && favoriteText.trim()) ? { favoritePart: favoritePart || favoriteText.trim() } : {}),
      ...(!run && narration.trim() ? { narration: narration.trim() } : {}),
      ...(feeling ? { feeling } : {}),
      ...readingContext.current,
      ...(talk.notes.length ? { parentNotes: [...talk.notes] } : {}),
      startedAt: startedAt.current,
      transcript: [...transcript.current],
    };
    later(() => props.onFinishBook(input), 900);
  };

  // ── Render per step ──────────────────────────────────────────────────
  let content: React.ReactNode = null;
  const talkBar = (
    <TalkBar
      key={`${step.kind}-${generation.current}`}
      kit={props.talk}
      teacherName="Professor Hoot"
      busy={talk.thinking || busy}
      onSay={(t, via) => void tellHoot(t, via)}
    />
  );
  switch (step.kind) {
    case 'menu':
      content = (
        <>
          <Choices
            items={[
              { id: 'finish', label: 'I finished a book!', icon: '📖', tone: 'primary' },
              { id: 'more', label: reading.length > 0 ? 'I read some more' : 'I’m reading a book', icon: '🔖' },
              { id: 'bye', label: 'Bye for now', icon: '👋' },
            ]}
            onPick={(id) => {
              playSfx('click');
              if (id === 'bye') {
                log('child', 'Bye for now');
                close();
                return;
              }
              cancelPending();
              talk.reset();
              log('child', id === 'finish' ? 'I finished a book!' : reading.length > 0 ? 'I read some more' : 'I’m reading a book');
              if (id === 'more' && reading.length + upNext.length === 0) {
                setStep({ kind: 'newBook', mode: 'start' });
                say(`A new adventure! What is the book called? ${typeHint}`, 'thinking');
                return;
              }
              if (id === 'finish' && reading.length + upNext.length === 0) {
                setStep({ kind: 'newBook', mode: 'finish' });
                say(`${finishedBookGreeting(props.books, props.historyStatus)} What is the book called? ${typeHint}`, 'cheer');
                return;
              }
              setStep({ kind: 'pick', mode: id === 'finish' ? 'finish' : 'more' });
              say(id === 'finish' ? 'Wonderful! Which book did you finish?' : 'Splendid! Which book were you reading?', 'happy');
            }}
          />
          {talkBar}
        </>
      );
      break;
    case 'talk': {
      const t = talk.topic;
      const onShelf = bookFor(t.book?.existingBookId)?.status === 'completed';
      const items: ChoiceItem[] = [];
      if (t.book && !onShelf && !talk.thinking) {
        if (t.finished === true) items.push({ id: 'shelf', label: 'Put it on my shelf!', icon: '📚', tone: 'primary' });
        else if (t.finished === null)
          items.push({ id: 'yes', label: 'Yes, the whole book!', icon: '✅', tone: 'primary' }, { id: 'notyet', label: 'Not yet', icon: '🔖' });
        else items.push({ id: 'bookmark', label: bookFor(t.book.existingBookId) ? 'I read some more' : 'Bookmark it!', icon: '🔖', tone: 'primary' });
      }
      items.push({ id: 'bye', label: 'Bye for now', icon: '👋' });
      content = (
        <>
          {t.book && (
            <div className="talk-topic" data-testid="talk-topic">
              <BookCover
                title={t.book.title}
                author={t.book.author ?? ''}
                cover={getCatalogBook(t.book.catalogId)?.cover ?? generatedCover(t.book.title)}
                width={46}
              />
              <div>
                <strong>{t.book.title}</strong>
                {(t.readTo || t.readBy) && <span className="muted">{t.readTo ? `Read to ${t.readTo}` : `Read by ${t.readBy}`}</span>}
              </div>
            </div>
          )}
          <Choices
            items={items}
            onPick={(id) => {
              playSfx('click');
              if (id === 'yes')
                void tellHoot('Yes, the whole book!').then((accepted) => {
                  if (accepted && isCurrent()) talk.markFinished(true);
                });
              else if (id === 'notyet')
                void tellHoot('Not yet').then((accepted) => {
                  if (accepted && isCurrent()) talk.markFinished(false);
                });
              else if (id === 'shelf') {
                log('child', 'Put it on my shelf!');
                finishFromTalk();
              } else if (id === 'bookmark') {
                log('child', 'Bookmark it!');
                bookmarkFromTalk();
              } else {
                log('child', 'Bye for now');
                close();
              }
            }}
          />
          {talkBar}
        </>
      );
      break;
    }
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
          <button
            type="button"
            className="book-pick-item book-pick-other"
            data-testid="pick-new-book"
            onClick={() => {
              playSfx('click');
              setStep({ kind: 'newBook', mode: step.mode === 'finish' ? 'finish' : 'start' });
              say(`A new one! What is the book called? ${typeHint}`, 'thinking');
            }}
          >
            <span className="book-pick-plus">
              <Icon name="plus" size={36} />
            </span>
            <span className="book-pick-title">{step.mode === 'finish' ? 'A different book' : 'A new book'}</span>
          </button>
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
            if (!title || busy) return;
            void submitNewBook(step.mode, { title });
          }}
        >
          {mic && (
            <MicButton
              mic={mic}
              phrases={props.talk.phrases}
              label="Say the book’s name"
              disabled={busy}
              onInterim={(t) => {
                if (isCurrent()) setTitleLive(t);
              }}
              onTrouble={(m) => {
                if (!isCurrent()) return;
                setTitleLive('');
                setMicTrouble(m);
              }}
              onHeard={(t) => {
                if (!isCurrent()) return;
                setTitleLive('');
                setMicTrouble('');
                log('child', t, 'voice');
                setNewTitle(t.replace(/^(?:it'?s|it is|its called|it's called|called)\s+/i, '').replace(/[.!?]+$/, ''));
              }}
            />
          )}
          {micTrouble && <p className="talk-trouble">{micTrouble}</p>}
          <input
            className="big-input"
            value={titleLive || newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Book title"
            aria-label="Book title"
            data-testid="new-book-title"
            autoFocus
          />
          {suggestions.length > 0 && (
            <div className="suggest-row">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="suggest-chip"
                  disabled={busy}
                  data-testid={`suggest-${s.id}`}
                  onClick={() => void submitNewBook(step.mode, { title: s.title, author: s.author, catalogId: s.id })}
                >
                  <BookCover title={s.title} author={s.author} cover={s.cover} width={40} /> {s.title}
                </button>
              ))}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-big" disabled={!newTitle.trim() || busy} data-testid="new-book-save">
            {step.mode === 'finish' ? 'I finished it!' : 'That’s my book!'} <Icon name="arrowRight" />
          </button>
        </form>
      );
      break;
    }
    case 'questions': {
      const p = runRef.current?.currentProblem();
      const cat = getCatalogBook(book?.catalogId ?? newBookInput?.catalogId);
      content = p ? (
        <>
          <p className="talk-source" data-testid="story-source">
            {cat?.provenance ? 'Source-checked story question' : 'Built-in story question'}
          </p>
          <Choices items={p.choices.map((c) => ({ id: c.id, label: c.label }))} onPick={answer} state={choiceState} columns={1} />
          <button
            type="button"
            className="btn btn-big"
            disabled={busy}
            data-testid="story-hint"
            onClick={() => {
              if (!isCurrent() || locked.current || !runRef.current) return;
              log('child', 'A hint, please');
              say(runRef.current.hint().message, 'thinking');
            }}
          >
            A hint, please
          </button>
          <button
            type="button"
            className="btn btn-big"
            disabled={busy}
            data-testid="story-skip"
            onClick={() => {
              if (!isCurrent() || locked.current || !runRef.current) return;
              log('child', 'Skip this question');
              const run = runRef.current;
              run.skip();
              setChoiceState({});
              if (run.isComplete) {
                setStep({ kind: 'rate' });
                say('We can leave those questions for another day. How many stars would you give the book?', 'happy');
              } else say(run.currentProblem()?.prompt ?? '', 'thinking');
              force((n) => n + 1);
            }}
          >
            Skip this question
          </button>
        </>
      ) : null;
      break;
    }
    case 'feeling':
      content = (
        <>
          <p className="talk-source" data-testid="story-source">
            Your own reflections · ungraded
          </p>
          <details className="story-reflections">
            <summary>Tell me more (optional)</summary>
            <label>
              Favorite part
              <input
                className="big-input"
                data-testid="reflection-favorite"
                value={favoriteText}
                maxLength={500}
                onChange={(e) => setFavoriteText(e.target.value)}
                placeholder="A part you liked"
              />
            </label>
            <label>
              Tell the story in your own words
              <textarea
                className="big-input"
                data-testid="reflection-narration"
                value={narration}
                maxLength={2000}
                onChange={(e) => setNarration(e.target.value)}
                rows={3}
              />
            </label>
            <p>A grown-up can help you type. These ideas are saved without a score.</p>
          </details>
          {book?.storyPrompt?.prompt.trim() && book.storyPrompt.answer.trim() && (
            <details className="story-reflections">
              <summary>A question from your grown-up (optional)</summary>
              <p data-testid="parent-story-prompt">{book.storyPrompt.prompt}</p>
              <label>
                Your answer
                <textarea
                  className="big-input"
                  data-testid="parent-story-response"
                  value={parentResponse}
                  maxLength={2000}
                  onChange={(e) => setParentResponse(e.target.value)}
                  rows={2}
                />
              </label>
              <details>
                <summary>See your grown-up’s reference answer</summary>
                <p>{book.storyPrompt.answer}</p>
              </details>
              <p>Parent-authored, ungraded. Talk about the answer together.</p>
            </details>
          )}
          <Choices
            columns={3}
            state={choiceState}
            emojiOnly
            items={GENERIC_FEELINGS.map((f) => ({ id: f, label: f, icon: FEELING_ICONS[f] ?? '📘' }))}
            onPick={(f) => {
              playSfx('click');
              log('child', f);
              setFeeling(f);
              setChoiceState({ [f]: 'right' });
              say(`${f}! I love that.`, 'cheer');
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-big"
            disabled={!feeling}
            onClick={() => {
              setChoiceState({});
              setStep({ kind: 'rate' });
              say('How many stars would you give it?', 'thinking');
            }}
          >
            Next
          </button>
          <button
            type="button"
            className="btn btn-big"
            onClick={() => {
              setFeeling(undefined);
              setChoiceState({});
              setStep({ kind: 'rate' });
              say('How many stars would you give it?', 'thinking');
            }}
          >
            Not sure
          </button>
        </>
      );
      break;
    case 'rate': {
      const next = (n: number) => {
        if (locked.current) return;
        ratingRef.current = n;
        setRating(n);
        if (n) log('child', `Rating: ${'★'.repeat(n)}`);
        const cat = getCatalogBook(book?.catalogId ?? newBookInput?.catalogId);
        if (cat?.moments.length) {
          setStep({ kind: 'favorite' });
          say('Thank you! What was your favorite part?', 'happy');
        } else finish();
      };
      content = (
        <>
          <div className="star-row" role="group" aria-label="Rate the book">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className={`star-btn ${rating === n ? 'on' : ''}`}
                data-testid={`star-${n}`}
                onClick={() => {
                  playSfx('click');
                  ratingRef.current = n;
                  setRating(n);
                }}
              >
                <Icon name="star" size={28} />
                <span>{n}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-big" disabled={!rating} onClick={() => next(ratingRef.current)} data-testid="rating-next">
            Next
          </button>
          <button type="button" className="btn btn-big" onClick={() => next(0)} data-testid="rating-skip">
            Not now
          </button>
        </>
      );
      break;
    }
    case 'favorite': {
      const cat = getCatalogBook(book?.catalogId ?? newBookInput?.catalogId);
      content = (
        <>
          {mic && (
            <MicButton
              mic={mic}
              label="Tell Professor Hoot"
              onTrouble={() => {
                if (isCurrent()) say('Hoo? I didn’t quite hear that. You can tap one instead!', 'thinking');
              }}
              onHeard={(heard) => {
                if (!isCurrent()) return;
                log('child', heard, 'voice');
                finish(heard);
              }}
            />
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (favoriteText.trim()) {
                log('child', favoriteText.trim(), 'typed');
                finish(favoriteText.trim());
              }
            }}
          >
            <input
              className="big-input"
              aria-label="Favorite part"
              placeholder="Type a favorite part (optional)"
              value={favoriteText}
              onChange={(e) => setFavoriteText(e.target.value)}
            />
            <button className="btn btn-big" type="submit" disabled={!favoriteText.trim() || busy}>
              Save my favorite part
            </button>
          </form>
          <Choices
            columns={2}
            items={[...(cat?.moments ?? []).map((m) => ({ id: m, label: m })), { id: '__skip', label: 'Skip favorite part', icon: '➡️' }]}
            onPick={(m) => {
              playSfx('click');
              log('child', m === '__skip' ? 'Skip favorite part' : m);
              finish(m === '__skip' ? undefined : m);
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
              if (!isCurrent() || !book || locked.current) return;
              locked.current = true;
              const token = generation.current;
              setBusy(true);
              log('child', `${chapters} ${book.totalChapters ? 'chapters' : 'pages'}`);
              let reply: string;
              try {
                reply = await props.onReadMore(book.id, chapters, [...transcript.current], startedAt.current);
              } catch {
                if (mounted.current && generation.current === token) {
                  locked.current = false;
                  setBusy(false);
                  say('I couldn’t save that just now. Please try again.', 'happy');
                }
                return;
              }
              if (!mounted.current || generation.current !== token) return;
              locked.current = false;
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
    <DialogueShell teacher="hoot" line={currentLine} mood={mood} onClose={close} speech={talk.guardSpeech(speech)} wide={step.kind === 'pick'}>
      {aiLine && (
        <p className="talk-source" data-testid="ai-story-source">
          AI conversation · book facts are unverified · no comprehension score
        </p>
      )}
      {content}
      {step.kind !== 'menu' && step.kind !== 'bye' && (
        <button type="button" className="btn btn-big" onClick={back}>
          Back to library
        </button>
      )}
    </DialogueShell>
  );
}

export const HOOT = TEACHERS.hoot;
