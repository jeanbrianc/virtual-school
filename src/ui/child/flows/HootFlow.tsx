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
import { effectiveLevel, masteryRank } from '../../../domain/mastery/masteryEngine';
import { LessonRun } from '../../../domain/lessons/engine';
import { storyChatLesson } from '../../../domain/lessons/storyChat';
import { GENERIC_FEELINGS, getCatalogBook, selectQuestions } from '../../../domain/reading/bookCatalog';
import { generatedCover, searchCatalogSync } from '../../../domain/reading/bookMetadata';
import { readingNote, type TeacherChatReply } from '../../../domain/teachers/chat';
import { TEACHERS, pickLine, teacherOpening } from '../../../domain/teachers/teachers';
import type { Book, MasteryRecord, ReadingMode, TranscriptLine } from '../../../domain/types';
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
  mastery: MasteryRecord[];
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
  /** How she read the book, when she told Hoot ("I read it to Daddy"). */
  const readingContext = useRef<{ sessionNote?: string; readingMode?: ReadingMode }>({});
  const [titleLive, setTitleLive] = useState('');
  const [micTrouble, setMicTrouble] = useState('');

  const log = (speaker: TranscriptLine['speaker'], text: string, via?: TranscriptLine['via']) =>
    transcript.current.push({ speaker, text, at: new Date().toISOString(), ...(via ? { via } : {}) });
  const say = (text: string, m: typeof mood = 'happy', via?: TranscriptLine['via']) => {
    setLine(text);
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
  });
  const mic = props.talk.mic;
  const typeHint = mic ? 'Tap the microphone and say it — or type it.' : 'You can ask a grown-up to help you type it.';

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
  }, []);

  useEffect(() => {
    // Greeting is part of the parent-visible transcript.
    transcript.current.push({ speaker: 'teacher', text: opening, at: new Date().toISOString() });
  }, [opening]);
  const currentLine = line === '' ? opening : line;

  const close = () => props.onClose(transcript.current, startedAt.current, talk.notes);

  const bookFor = (id: string | undefined) => (id ? props.books.find((b) => b.id === id) : undefined);

  /** She said something to Hoot (voice, typing, or a quick-answer button). */
  const tellHoot = async (text: string, via?: 'voice' | 'typed') => {
    if (busy || talk.thinking) return;
    if (step.kind !== 'talk') setStep({ kind: 'talk' });
    setMicTrouble('');
    const reply: TeacherChatReply = await talk.send(text, via);
    let answer = reply.reply;
    const already = bookFor(reply.book?.existingBookId);
    if (already?.status === 'completed' && reply.intent !== 'safety' && reply.intent !== 'share' && reply.intent !== 'unclear') {
      answer += ` ${already.title} is already on your shelf — reading a favorite again is wonderful!`;
    }
    const m = reply.intent === 'finished_book' || reply.intent === 'read_to_someone' ? 'cheer' : reply.intent === 'question' ? 'thinking' : 'happy';
    say(answer, m, reply.source === 'ai' ? 'ai' : undefined);
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

  /** A title she typed or picked: finish it now, or start it as her current book. */
  const submitNewBook = async (mode: 'finish' | 'start', input: { title: string; author?: string; catalogId?: string }) => {
    log('child', input.title);
    if (mode === 'finish') {
      setNewBookInput(input);
      setBook(null);
      startQuestions(null, input.catalogId);
      return;
    }
    setBusy(true);
    const reply = await props.onStartBook(input, transcript.current, startedAt.current);
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
      ...readingContext.current,
      ...(talk.notes.length ? { parentNotes: [...talk.notes] } : {}),
      startedAt: startedAt.current,
      transcript: [...transcript.current],
    };
    window.setTimeout(() => props.onFinishBook(input), 900);
  };

  // ── Render per step ──────────────────────────────────────────────────
  let content: React.ReactNode = null;
  const talkBar = <TalkBar kit={props.talk} teacherName="Professor Hoot" busy={talk.thinking || busy} onSay={(t, via) => void tellHoot(t, via)} />;
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
              log('child', id === 'finish' ? 'I finished a book!' : reading.length > 0 ? 'I read some more' : 'I’m reading a book');
              if (id === 'more' && reading.length + upNext.length === 0) {
                setStep({ kind: 'newBook', mode: 'start' });
                say(`A new adventure! What is the book called? ${typeHint}`, 'thinking');
                return;
              }
              if (id === 'finish' && reading.length + upNext.length === 0) {
                setStep({ kind: 'newBook', mode: 'finish' });
                say(`Hoo-ray, your very first one! What is the book called? ${typeHint}`, 'cheer');
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
              if (id === 'yes') void tellHoot('Yes, the whole book!').then(() => talk.markFinished(true));
              else if (id === 'notyet') void tellHoot('Not yet').then(() => talk.markFinished(false));
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
              onInterim={(t) => setTitleLive(t)}
              onTrouble={(m) => {
                setTitleLive('');
                setMicTrouble(m);
              }}
              onHeard={(t) => {
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
      content = (
        <>
          {mic && (
            <MicButton
              mic={mic}
              label="Tell Professor Hoot"
              onTrouble={() => say('Hoo? I didn’t quite hear that. You can tap one instead!', 'thinking')}
              onHeard={(heard) => {
                log('child', heard, 'voice');
                finish(heard);
                setStep({ kind: 'bye', line: '' });
              }}
            />
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
