/**
 * Child mode: Izzy's explorable 3D school. Orchestrates the engine, teacher
 * conversations, lessons, celebrations and the core-loop cinematics.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { useServices } from '../../app/services';
import { FEATURE_FLAGS } from '../../config/gameConfig';
import { getLesson } from '../../domain/lessons/registry';
import type { LessonRun } from '../../domain/lessons/engine';
import { getReward } from '../../domain/rewards/catalog';
import { ruleProgress } from '../../domain/rewards/engine';
import { TEACHERS, type TeacherId } from '../../domain/teachers/teachers';
import type { TranscriptLine } from '../../domain/types';
import { toDay } from '../../domain/util/time';
import { Game, type FocusInfo } from '../../engine/Game';
import type { PetId } from '../../engine/characters/pets';
import { recordConversation, recordLesson, startTierFor } from '../../services/lessonService';
import { completeBook, logReading, type CompleteBookInput } from '../../services/readingService';
import { markRewardsCelebrated, setActivePet, updateSettings } from '../../services/householdService';
import { appStore } from '../../state/appState';
import { useStore } from '../../state/store';
import { Icon } from '../shared/Icon';
import type { Speech } from './DialogueShell';
import { HootFlow } from './flows/HootFlow';
import { LessonFlow } from './flows/LessonFlow';
import { BookshelfViewer, Celebration, HintCard, ParentGate, Treasures, rewardToCelebration, type CelebrationItem } from './Overlays';
import { useChildWorld, type ChildWorldData } from './useChildWorld';

type Overlay =
  | { kind: 'hoot' }
  | { kind: 'lesson'; teacher: 'digit' | 'nova'; startTier: number }
  | { kind: 'shelf' }
  | { kind: 'treasures' }
  | { kind: 'gate' }
  | { kind: 'celebrate'; items: CelebrationItem[]; rewardIds: string[] }
  | null;

interface Hint {
  icon: string;
  title: string;
  text: string;
  progress?: { current: number; target: number };
}

const NATURE_EMOJI: Record<string, string> = {
  acorn: '🌰',
  leaf: '🍂',
  feather: '🪶',
  pinecone: '🌲',
  rock: '🪨',
  shell: '🐚',
  flower: '🌸',
  stick: '🪵',
  mushroom: '🍄',
  seed: '🌱',
  moss: '🌿',
  berry: '🫐',
  bark: '🪵',
};

export function ChildMode({ childId }: { childId: string }) {
  const services = useServices();
  const { ctx, audio } = services;
  const { data, error, reload } = useChildWorld(childId);
  const preview = useStore(appStore, (s) => s.preview);
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const dataRef = useRef<ChildWorldData | null>(null);
  dataRef.current = data;
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<FocusInfo | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const overlayRef = useRef<Overlay>(null);
  overlayRef.current = overlay;
  const [hint, setHint] = useState<Hint | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [busy, setBusy] = useState(false);

  const household = data?.household;
  const muted = household?.settings.audio.muted ?? false;

  // ── Speech (optional read-aloud) ────────────────────────────────────────
  const teacherForSpeech = useRef<TeacherId>('hoot');
  const readAloud = household?.settings.readAloud ?? false;
  const speech: Speech = useMemo(
    () => ({
      canSpeak: services.speechOut.available,
      auto: readAloud,
      speak: (text: string) => {
        const settings = dataRef.current?.household.settings;
        if (settings?.audio.muted) return;
        const v = TEACHERS[teacherForSpeech.current].voice;
        void services.speechOut.speak(text, { pitch: v.pitch, rate: v.rate, volume: settings?.audio.voice ?? 1 });
      },
    }),
    [services.speechOut, readAloud],
  );

  // ── Interactions from the 3D world ──────────────────────────────────────
  const handleInteract = useCallback(
    async (id: string) => {
      const d = dataRef.current;
      const game = gameRef.current;
      if (!d || !game || overlayRef.current) return;
      setShowControls(false);
      const state = appStore.get().preview?.world ?? d.world;
      if (appStore.get().preview && (id === 'hoot' || id === 'digit' || id === 'nova' || id === 'tank' || id === 'rocket')) {
        setHint({ icon: '✨', title: 'Preview mode', text: 'This is a peek at the future school. Lessons are paused in preview.' });
        return;
      }
      if (id === 'hoot') {
        teacherForSpeech.current = 'hoot';
        game.setInputEnabled(false);
        void game.focusTeacher('hoot');
        setOverlay({ kind: 'hoot' });
        return;
      }
      if (id === 'digit' || id === 'nova' || id === 'tank' || id === 'rocket') {
        const teacher = id === 'digit' || id === 'rocket' ? 'digit' : 'nova';
        const lesson = getLesson(teacher === 'digit' ? 'moon-rocks' : 'sink-float');
        if (!lesson) return;
        teacherForSpeech.current = teacher;
        game.setInputEnabled(false);
        const startTier = await startTierFor(ctx, childId, lesson);
        if (id !== teacher) game.interactById(teacher);
        void game.focusTeacher(teacher);
        setOverlay({ kind: 'lesson', teacher, startTier });
        return;
      }
      if (id === 'bookshelf') {
        audio.play('pageFlip');
        setOverlay({ kind: 'shelf' });
        return;
      }
      if (id === 'trophies') {
        setOverlay({ kind: 'treasures' });
        return;
      }
      if (id === 'museum') {
        audio.play('chime');
        navigate({ name: 'museum', childId, tour: true });
        return;
      }
      if (id === 'nature') {
        const items = state.natureItems;
        setHint({
          icon: '🍂',
          title: 'My nature finds',
          text: items.length ? items.map((i) => `${NATURE_EMOJI[i] ?? '✨'} ${i}`).join('  ·  ') : 'Go on a nature walk to fill this table!',
        });
        return;
      }
      const lockHints: Record<string, { rewardId: string; open: boolean; openText: string }> = {
        greenhouse: { rewardId: 'room.greenhouse', open: state.greenhouseOpen, openText: 'Every plant in here grew from something you learned about plants!' },
        artStudio: { rewardId: 'room.art-studio', open: state.artStudioOpen, openText: 'Your very own Art Studio. Easels ready!' },
        nook: { rewardId: 'room.reading-nook', open: state.readingNookOpen, openText: 'The coziest place to read.' },
      };
      const lock = lockHints[id];
      if (lock) {
        const reward = getReward(lock.rewardId);
        if (!reward) return;
        if (lock.open) {
          setHint({ icon: reward.icon, title: reward.childTitle.replace(/ is open!$/, ''), text: lock.openText });
          return;
        }
        const progress = ruleProgress(reward.rule, d.snapshot);
        audio.play('tryAgain', { volume: 0.6 });
        setHint({
          icon: '🔒',
          title: `${reward.name} — coming soon!`,
          text: `${reward.hint} to open it. You’re on your way!`,
          progress: { current: progress.current, target: progress.target },
        });
      }
    },
    [audio, childId, ctx],
  );

  // ── Game lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !host.current || gameRef.current) return;
    let cancelled = false;
    void Game.create({
      container: host.current,
      avatar: data.avatar,
      quality: data.household.settings.graphicsQuality,
      audio,
      today: new Date(),
      callbacks: {
        onFocus: (f) => setFocus(f),
        onInteract: (id) => void handleInteract(id),
        onBack: () => {
          const o = overlayRef.current;
          if (o && o.kind !== 'celebrate' && o.kind !== 'hoot' && o.kind !== 'lesson') setOverlay(null);
        },
      },
    }).then(async (game) => {
      if (cancelled) {
        game.dispose();
        return;
      }
      gameRef.current = game;
      await game.applyWorld(data.world, data.shelfBooks, false);
      game.syncPets(data.world.pets as PetId[], data.child.activePetId ?? null);
      setReady(true);
      audio.setSettings(data.household.settings.audio);
      audio.startAmbience();
      const pv = appStore.get().preview;
      await game.introSweep();
      if (pv) {
        game.setInputEnabled(false);
        await game.revealUnlocks(pv.celebrate, pv.world, pv.books);
        game.setShelfBooks(pv.books);
        game.syncPets(pv.world.pets as PetId[], 'pet.dragon');
        if (pv.celebrate.some((id) => getReward(id)?.celebration === 'grand')) game.confetti();
        const items = pv.celebrate.map(getReward).filter((r) => !!r).map((r) => rewardToCelebration(r!));
        if (items.length) setOverlay({ kind: 'celebrate', items, rewardIds: [] });
        else game.setInputEnabled(true);
      } else {
        setToast(`Welcome back, ${data.child.name}!`);
        window.setTimeout(() => setToast(null), 3500);
        // Celebrate anything unlocked from parent-logged activities since last visit.
        const pending = data.records.unlocks.filter((u) => !u.celebrated).map((u) => getReward(u.rewardId)).filter((r) => !!r);
        if (pending.length) {
          window.setTimeout(() => {
            if (!overlayRef.current) {
              game.setInputEnabled(false);
              setOverlay({ kind: 'celebrate', items: pending.map((r) => rewardToCelebration(r!)), rewardIds: pending.map((r) => r!.id) });
            }
          }, 1200);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data !== null]);

  useEffect(
    () => () => {
      gameRef.current?.dispose();
      gameRef.current = null;
      audio.stopAmbience();
      services.speechOut.cancel();
    },
    [audio, services.speechOut],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setShowControls(false), 12000);
    return () => window.clearTimeout(t);
  }, []);

  // Automation hook for end-to-end tests (dev/e2e builds only).
  useEffect(() => {
    if (!FEATURE_FLAGS.automationHooks) return;
    (window as unknown as { __izzy?: unknown }).__izzy = {
      game: () => gameRef.current,
      interact: (id: string) => void handleInteract(id),
      walkTo: (id: string) => gameRef.current?.interactById(id),
      teleportTo: (id: string) => gameRef.current?.teleportTo(id),
      overlay: () => overlayRef.current?.kind ?? null,
      booksOnShelf: () => dataRef.current?.shelfBooks.length ?? 0,
    };
  }, [handleInteract]);

  // ── Flow completions ───────────────────────────────────────────────────
  const endConversation = useCallback(
    async (teacher: TeacherId, flow: string, transcript: TranscriptLine[], startedAt: string, outcome: string) => {
      setOverlay(null);
      await recordConversation(ctx, childId, teacher, flow, startedAt, transcript, outcome);
      const game = gameRef.current;
      if (game) {
        await game.releaseCamera();
        game.setInputEnabled(true);
      }
    },
    [ctx, childId],
  );

  const finishBook = useCallback(
    async (input: Omit<CompleteBookInput, 'source'>) => {
      const game = gameRef.current;
      if (!game || busy) return;
      setBusy(true);
      setOverlay(null);
      game.setInputEnabled(false);
      try {
        const res = await completeBook(ctx, childId, { ...input, source: 'child' });
        const fresh = await reload();
        await game.releaseCamera();
        await game.celebrateBook({ id: res.book.id, title: res.book.title, author: res.book.author, cover: res.book.cover, shelfIndex: res.shelfIndex });
        const ids = res.outcome.newRewards.map((r) => r.id);
        if (fresh) {
          if (ids.length) await game.revealUnlocks(ids, fresh.world, fresh.shelfBooks);
          else await game.applyWorld(fresh.world, fresh.shelfBooks, false);
        }
        if (res.outcome.newRewards.some((r) => r.celebration === 'grand')) game.confetti();
        else audio.play('fanfare', { volume: 0.7 });
        const n = res.booksCompleted;
        setOverlay({
          kind: 'celebrate',
          rewardIds: ids,
          items: [
            {
              key: 'book',
              icon: '📖',
              title: n % 5 === 0 ? `Book number ${n}!` : 'On your shelf!',
              message: `${res.book.title} is on your bookshelf forever. You’ve read ${n} book${n === 1 ? '' : 's'}!`,
              cover: { title: res.book.title, author: res.book.author, cover: res.book.cover },
            },
            ...res.outcome.newRewards.map(rewardToCelebration),
          ],
        });
      } catch (err) {
        console.error(err);
        setHint({ icon: '🦉', title: 'Hmm!', text: 'Something went wrong saving that book. A grown-up can add it in the Parent Studio.' });
        game.setInputEnabled(true);
        await game.releaseCamera();
      } finally {
        setBusy(false);
      }
    },
    [audio, busy, childId, ctx, reload],
  );

  const readMore = useCallback(
    async (bookId: string, chapters: number, transcript: TranscriptLine[], startedAt: string): Promise<string> => {
      const book = dataRef.current?.records.books.find((b) => b.id === bookId);
      const res = await logReading(ctx, childId, {
        bookId,
        ...(book?.totalChapters ? { chaptersRead: chapters } : { pagesRead: chapters }),
        source: 'child',
      });
      await recordConversation(ctx, childId, 'hoot', 'read-more', startedAt, transcript, `Logged ${chapters} ${book?.totalChapters ? 'chapters' : 'pages'} of ${book?.title ?? 'a book'}`);
      void reload();
      const b = res.book;
      if (b.totalChapters) {
        const left = b.totalChapters - (b.chaptersRead ?? 0);
        return left <= 0
          ? `You read to the very end! When you’re ready, tell me you finished it.`
          : `Marvelous reading! You’re on chapter ${b.chaptersRead} of ${b.totalChapters}. Only ${left} to go!`;
      }
      return 'Marvelous reading! Every page makes your brain stronger.';
    },
    [childId, ctx, reload],
  );

  const finishLesson = useCallback(
    async (teacher: 'digit' | 'nova', run: LessonRun, transcript: TranscriptLine[], startedAt: string) => {
      const game = gameRef.current;
      if (!game || busy) return;
      setBusy(true);
      setOverlay(null);
      game.setInputEnabled(false);
      try {
        const res = await recordLesson(ctx, childId, run, startedAt, transcript);
        const fresh = await reload();
        await game.releaseCamera();
        game.cheer(teacher);
        const ids = res.outcome.newRewards.map((r) => r.id);
        if (fresh) await game.revealUnlocks(ids, fresh.world, fresh.shelfBooks, teacher === 'digit' ? 'rocket' : 'aquarium');
        if (res.outcome.newRewards.some((r) => r.celebration === 'grand')) game.confetti();
        const lesson = run.definition;
        setOverlay({
          kind: 'celebrate',
          rewardIds: ids,
          items: [
            {
              key: 'lesson',
              icon: teacher === 'digit' ? '🚀' : '🔬',
              title: lesson.completeTitle,
              message:
                teacher === 'digit'
                  ? `You helped Digit on another moon mission. ${fresh && fresh.world.rocketStage >= 3 ? 'The rocket is almost ready!' : 'The rocket grew a little more!'}`
                  : 'Nova added a new fish friend to the aquarium to thank you!',
            },
            ...res.outcome.newRewards.map(rewardToCelebration),
          ],
        });
      } catch (err) {
        console.error(err);
        game.setInputEnabled(true);
        await game.releaseCamera();
      } finally {
        setBusy(false);
      }
    },
    [busy, childId, ctx, reload],
  );

  const doneCelebrating = useCallback(async () => {
    const o = overlayRef.current;
    setOverlay(null);
    if (o?.kind === 'celebrate' && o.rewardIds.length) await markRewardsCelebrated(ctx, childId, o.rewardIds);
    const game = gameRef.current;
    if (game) {
      game.celebratePets();
      await game.releaseCamera();
      game.setInputEnabled(true);
    }
  }, [ctx, childId]);

  // ── HUD actions ─────────────────────────────────────────────────────────
  const toggleSound = async () => {
    if (!household) return;
    const next = { ...household.settings.audio, muted: !household.settings.audio.muted };
    audio.setSettings(next);
    if (!next.muted) audio.play('pop');
    await updateSettings(ctx, { audio: next });
    void reload();
  };

  const openGate = () => {
    gameRef.current?.setInputEnabled(false);
    setOverlay({ kind: 'gate' });
  };

  const closeSheet = () => {
    setOverlay(null);
    gameRef.current?.setInputEnabled(true);
  };

  if (error) {
    return (
      <div className="boot" role="alert">
        {error} <a href="#/">Go home</a>
      </div>
    );
  }

  const visitsToday = (teacher: TeacherId) =>
    data?.records.interactions.filter((i) => i.teacherId === teacher && i.startedAt.slice(0, 10) === toDay(new Date()).slice(0, 10)).length ?? 0;
  const lastSummary = (lessonId: string) => {
    const last = [...(data?.records.lessons ?? [])].filter((l) => l.lessonId === lessonId).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
    if (!last) return undefined;
    return lessonId === 'moon-rocks' ? 'Thanks for helping with my moon rocks last time — the rocket is growing!' : 'Remember our floating experiments? I have new mysteries!';
  };
  const booksCount = data?.shelfBooks.length ?? 0;

  return (
    <div className={`child-mode ${ready ? 'ready' : ''}`} data-testid="child-mode">
      <div ref={host} className="game-host" />
      {!ready && (
        <div className="loading-screen">
          <div className="loading-card">
            <div className="loading-house">🏫</div>
            <p>Opening {data?.child.name ?? 'your'}’s school…</p>
            <div className="loading-bar">
              <span />
            </div>
          </div>
        </div>
      )}

      {ready && data && (
        <>
          <header className="hud">
            <div className="hud-left">
              <div className="name-badge">
                <span className="name-badge-dot" style={{ background: data.avatar.outfitColor }} />
                {data.child.name}
              </div>
              <div className="hud-chip" title="Books on my shelf" data-testid="hud-books">
                📚 <strong>{preview ? preview.books.length : booksCount}</strong>
              </div>
            </div>
            <nav className="hud-right" aria-label="School menu">
              <button type="button" className="hud-btn" onClick={() => void toggleSound()} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
                <Icon name={muted ? 'mute' : 'sound'} size={26} />
                <span>{muted ? 'Sound off' : 'Sound'}</span>
              </button>
              <button type="button" className="hud-btn" onClick={() => setOverlay({ kind: 'treasures' })} aria-label="My treasures">
                <Icon name="backpack" size={26} />
                <span>Treasures</span>
              </button>
              <button type="button" className="hud-btn" onClick={() => navigate({ name: 'museum', childId, tour: true })} aria-label="My learning museum">
                <Icon name="museum" size={26} />
                <span>Museum</span>
              </button>
              <button type="button" className="hud-btn" onClick={openGate} aria-label="Grown-ups" data-testid="hud-grownups">
                <Icon name="lock" size={26} />
                <span>Grown-ups</span>
              </button>
              <button type="button" className="hud-btn" onClick={() => navigate({ name: 'home' })} aria-label="Home">
                <Icon name="home" size={26} />
                <span>Home</span>
              </button>
            </nav>
          </header>

          {preview && (
            <div className="preview-ribbon" role="status">
              ✨ Preview: {preview.label} — nothing here is saved
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  appStore.set({ preview: null });
                  navigate({ name: 'parent', section: 'settings' });
                }}
              >
                End preview
              </button>
            </div>
          )}

          {toast && <div className="toast">{toast}</div>}

          {showControls && !overlay && (
            <div className="controls-hint" role="note">
              <span className="keys">
                <kbd>←</kbd>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>→</kbd>
              </span>
              Walk with the arrow keys — or tap where you want to go!
            </div>
          )}

          {focus && !overlay && !busy && (
            <button type="button" className="interact-prompt" onClick={() => gameRef.current?.interactById(focus.id)} data-testid="interact-prompt">
              <span className="interact-icon">{focus.icon}</span>
              <span className="interact-label">{focus.label}</span>
              <kbd className="interact-key">{gameRef.current?.inputDevice === 'gamepad' ? 'A' : 'Space'}</kbd>
            </button>
          )}

          {hint && <HintCard {...hint} onClose={() => setHint(null)} />}

          {overlay?.kind === 'hoot' && (
            <HootFlow
              childName={data.child.name}
              books={data.records.books}
              mastery={data.records.mastery}
              visitsToday={visitsToday('hoot')}
              speech={speech}
              playSfx={(n) => audio.play(n)}
              onFinishBook={(input) => void finishBook(input)}
              onReadMore={readMore}
              onClose={(t, s) => void endConversation('hoot', 'chat', t, s, 'Visited Professor Hoot')}
            />
          )}
          {overlay?.kind === 'lesson' && (
            <LessonFlow
              teacher={overlay.teacher}
              lesson={getLesson(overlay.teacher === 'digit' ? 'moon-rocks' : 'sink-float')!}
              startTier={overlay.startTier}
              visitsToday={visitsToday(overlay.teacher)}
              {...(lastSummary(overlay.teacher === 'digit' ? 'moon-rocks' : 'sink-float') ? { lastSummary: lastSummary(overlay.teacher === 'digit' ? 'moon-rocks' : 'sink-float')! } : {})}
              speech={speech}
              playSfx={(n) => audio.play(n)}
              onComplete={(run, t, s) => void finishLesson(overlay.teacher, run, t, s)}
              onClose={(t, s) => void endConversation(overlay.teacher, 'chat', t, s, `Visited ${TEACHERS[overlay.teacher].name}`)}
            />
          )}
          {overlay?.kind === 'shelf' && <BookshelfViewer books={data.records.books} onClose={closeSheet} />}
          {overlay?.kind === 'treasures' && (
            <Treasures
              unlocks={data.records.unlocks}
              snapshot={data.snapshot}
              activePet={data.child.activePetId}
              onPickPet={async (id) => {
                await setActivePet(ctx, childId, id);
                gameRef.current?.syncPets(data.world.pets as PetId[], id);
                gameRef.current?.celebratePets();
                audio.play('petHappy');
                void reload();
              }}
              onClose={closeSheet}
            />
          )}
          {overlay?.kind === 'gate' && household && (
            <ParentGate
              pin={household.settings.parentPin}
              showHint={household.settings.demoTools}
              onPass={() => {
                appStore.set({ parentUnlocked: true, preview: null });
                navigate({ name: 'parent', section: 'today' });
              }}
              onClose={closeSheet}
            />
          )}
          {overlay?.kind === 'celebrate' && <Celebration items={overlay.items} onDone={() => void doneCelebrating()} />}
        </>
      )}
    </div>
  );
}
