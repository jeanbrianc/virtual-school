/**
 * Child mode: Izzy's explorable 3D school. Orchestrates the engine, teacher
 * conversations, lessons, celebrations and the core-loop cinematics.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { useLiveQuery, useServices } from '../../app/services';
import { FEATURE_FLAGS } from '../../config/gameConfig';
import {
  DISCOVERABLE_IDS,
  EXPLORER_CELEBRATION,
  describeDiscovery,
  isTeacherDiscovery,
  undiscovered,
  welcomeDiscovery,
  type Discovery,
} from '../../domain/discovery';
import { getLesson } from '../../domain/lessons/registry';
import {
  CIRCUIT_DONE_LINE,
  CIRCUIT_START_LINE,
  DANCE_MOVES,
  STATIONS,
  circuitFor,
  freshRun,
  stationLabel,
  stationLine,
  stepOn,
  type CircuitRun,
  type DanceMoveId,
} from '../../domain/play/circuit';
import type { LessonRun } from '../../domain/lessons/engine';
import { getReward } from '../../domain/rewards/catalog';
import { ruleProgress } from '../../domain/rewards/engine';
import { speakableText } from '../../domain/pronounce';
import { browserFamily, knownOnDevice, type OnDeviceAnswer } from '../../domain/talk';
import { talkPhrases } from '../../domain/teachers/chat';
import { isAllowedHelperUrl, naturalVoicesOn } from '../../domain/teachers/chatRemote';
import { TEACHERS, type TeacherId } from '../../domain/teachers/teachers';
import type { TranscriptLine } from '../../domain/types';
import { toDay } from '../../domain/util/time';
import { Game, type FocusInfo } from '../../engine/Game';
import type { PetId } from '../../engine/characters/pets';
import { recordConversation, recordLesson, startTierFor } from '../../services/lessonService';
import { addBook, completeBook, logReading, type CompleteBookInput } from '../../services/readingService';
import { markExplored, markRewardsCelebrated, setActivePet, updateChild, updateSettings } from '../../services/householdService';
import { getSpeechProbe, runSpeechProbe, settleInterruptedProbe } from '../../services/talkService';
import { appStore } from '../../state/appState';
import { useStore } from '../../state/store';
import { Icon } from '../shared/Icon';
import type { Speech } from './DialogueShell';
import { KeyboardFlow } from './flows/KeyboardFlow';
import { recordKeyboardTrail } from '../../services/keyboardService';
import { HootFlow } from './flows/HootFlow';
import { LessonFlow } from './flows/LessonFlow';
import { BookshelfViewer, Celebration, DiscoveryCard, HintCard, ParentGate, Treasures, rewardToCelebration, type CelebrationItem } from './Overlays';
import { MIC_NEEDS_GROWNUP, MIC_NO_BROWSER_SUPPORT, type MicSetup, type TalkKit } from './Talk';
import { useChildWorld, type ChildWorldData } from './useChildWorld';
import type { TalkAvailability } from '../../voice/SpeechService';

type Overlay =
  | { kind: 'keyboard' }
  | { kind: 'hoot' }
  | { kind: 'lesson'; teacher: 'digit' | 'nova'; startTier: number }
  | { kind: 'shelf' }
  | { kind: 'treasures' }
  | { kind: 'gate' }
  | { kind: 'celebrate'; items: CelebrationItem[]; rewardIds: string[] }
  | { kind: 'discover'; discovery: Discovery }
  | null;

/** The big "Three! Sunshine twirl!" bubble when she lands on a rug number. */
interface Callout {
  key: number;
  n: number | null;
  emoji: string;
  label: string;
  big?: boolean;
}

/** Marker stored in `explored` once the "you found everything" celebration has played. */
const EXPLORER_DONE = '__explorer';

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
  const [explored, setExplored] = useState<string[] | null>(null);
  const exploredRef = useRef<string[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const explorerPending = useRef(false);
  /** What happened in the current Hoot conversation (for the parent transcript). */
  const hootOutcome = useRef<string | null>(null);

  const household = data?.household;
  const muted = household?.settings.audio.muted ?? false;

  // ── Speech (optional read-aloud) ────────────────────────────────────────
  const teacherForSpeech = useRef<TeacherId>('hoot');
  const readAloud = household?.settings.readAloud ?? false;
  const naturalVoices = naturalVoicesOn(household?.settings.teacherAi);
  const speech: Speech = useMemo(
    () => ({
      canSpeak: services.speechOut.available || naturalVoices,
      auto: readAloud,
      speak: (text: string) => {
        const settings = dataRef.current?.household.settings;
        if (settings?.audio.muted) return;
        const teacher = teacherForSpeech.current;
        const v = TEACHERS[teacher].voice;
        const child = dataRef.current?.child;
        // Her name is respelled for the voice only (see domain/pronounce.ts).
        const spoken = child ? speakableText(text, child.name, child.sayName) : text;
        const ai = settings?.teacherAi;
        void services.speechOut.speak(spoken, {
          pitch: v.pitch,
          rate: v.rate,
          volume: settings?.audio.voice ?? 1,
          ...(settings?.voiceName ? { voiceName: settings.voiceName } : {}),
          ...(ai && naturalVoicesOn(ai) ? { natural: { endpoint: ai.endpoint, teacher } } : {}),
        });
      },
    }),
    [services.speechOut, readAloud, naturalVoices],
  );

  // ── Talking to teachers (speech-to-text + conversation) ─────────────────
  // The microphone shows whenever talking isn't off. Her first tap does the
  // setup (asks the browser about on-device listening behind a crash marker —
  // see domain/talk.ts — and downloads the voice pack if needed).
  const talkMode = household?.settings.talkMode ?? 'off';
  const family = browserFamily(navigator.userAgent);
  const probe = useLiveQuery(() => getSpeechProbe(ctx), [], ['meta']);
  const probingRef = useRef(false);
  const [probing, setProbing] = useState(false);
  useEffect(() => {
    // A marker left "pending" by an earlier page means asking crashed the tab: remember that.
    if (probe?.answer === 'pending' && !probingRef.current) void settleInterruptedProbe(ctx);
  }, [ctx, probe]);
  const known: OnDeviceAnswer = probing ? 'unknown' : knownOnDevice(probe, family);
  const knownRef = useRef<OnDeviceAnswer>(known);
  if (!probingRef.current) knownRef.current = known;
  const modeRef = useRef(talkMode);
  modeRef.current = talkMode;
  const micState: TalkAvailability = services.speechIn.check(talkMode, known);
  const ai = household?.settings.teacherAi;
  const books = data?.records.books;
  const talkKit: TalkKit = useMemo(() => {
    const { speechIn, speechOut } = services;
    const viaHelper = talkMode === 'helper';
    const needsSetup = !viaHelper && speechIn.canProbe && (known === 'unknown' || known === 'downloadable' || known === 'downloading');
    const helperEndpoint = ai?.endpoint && isAllowedHelperUrl(ai.endpoint) ? ai.endpoint : null;
    const blocked = viaHelper
      ? micState.state !== 'ready'
        ? MIC_NO_BROWSER_SUPPORT
        : helperEndpoint
          ? null
          : MIC_NEEDS_GROWNUP
      : !speechIn.available
        ? MIC_NO_BROWSER_SUPPORT
        : micState.state === 'unsupported'
          ? MIC_NEEDS_GROWNUP
          : null;
    const prepare = async (): Promise<MicSetup> => {
      probingRef.current = true;
      setProbing(true);
      try {
        let k = await runSpeechProbe(ctx, family, () => speechIn.probe());
        if (k === 'downloadable' || k === 'downloading') {
          await speechIn.install();
          k = await runSpeechProbe(ctx, family, () => speechIn.probe());
        }
        knownRef.current = k;
        const state = speechIn.check(modeRef.current, k).state;
        return state === 'ready' ? 'ready' : state === 'needs-download' || state === 'downloading' ? 'downloading' : 'unsupported';
      } catch {
        return 'unsupported';
      } finally {
        probingRef.current = false;
        setProbing(false);
      }
    };
    return {
      mic:
        talkMode === 'off'
          ? null
          : {
              onDevice: micState.onDevice,
              needsSetup: needsSetup && !blocked,
              blocked,
              prepare,
              listen: (o) => {
                // Never let the teacher's own voice be heard as hers.
                speechOut.cancel();
                const childName = dataRef.current?.child.name;
                const microphone = dataRef.current?.household.settings.microphone;
                return speechIn.listen(modeRef.current, knownRef.current, {
                  maxMs: 12_000,
                  ...o,
                  ...(microphone ? { microphone } : {}),
                  ...(helperEndpoint ? { helper: { endpoint: helperEndpoint, ...(childName ? { childName } : {}) } } : {}),
                });
              },
              stop: () => speechIn.stop(),
            },
      chat: services.teacherChat(dataRef.current?.household),
      phrases: talkPhrases(books ?? []),
      speakReply: (text: string) => speech.speak(text),
      autoSpeaks: speech.auto,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micState.state, micState.onDevice, known, talkMode, family, ai?.enabled, ai?.endpoint, ai?.consentToSend, books, speech, services, ctx]);

  // ── Discovery (first day) ───────────────────────────────────────────────
  useEffect(() => {
    if (data && explored === null) {
      exploredRef.current = data.child.explored ?? [];
      setExplored(exploredRef.current);
    }
  }, [data, explored]);

  const refreshDiscoveryMarkers = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    if (appStore.get().preview) {
      game.setUndiscovered([]);
      return;
    }
    const avail = game.availableInteractables().filter((id) => (DISCOVERABLE_IDS as readonly string[]).includes(id));
    setAvailable(avail);
    game.setUndiscovered(undiscovered(avail, exploredRef.current));
  }, []);

  useEffect(() => {
    if (ready) refreshDiscoveryMarkers();
  }, [ready, data, explored, refreshDiscoveryMarkers]);

  /** Records a discovery; returns true if this was the first time. */
  const discover = useCallback(
    async (id: string): Promise<boolean> => {
      if (appStore.get().preview || !(DISCOVERABLE_IDS as readonly string[]).includes(id) || exploredRef.current.includes(id)) return false;
      exploredRef.current = [...exploredRef.current, id];
      setExplored(exploredRef.current);
      audio.play('sparkle', { volume: 0.6 });
      const saved = await markExplored(ctx, childId, [id]);
      exploredRef.current = [...new Set([...exploredRef.current, ...saved])];
      const game = gameRef.current;
      const avail = game ? game.availableInteractables().filter((x) => (DISCOVERABLE_IDS as readonly string[]).includes(x)) : [];
      if (undiscovered(avail, exploredRef.current).length === 0 && !exploredRef.current.includes(EXPLORER_DONE)) explorerPending.current = true;
      refreshDiscoveryMarkers();
      return true;
    },
    [audio, childId, ctx, refreshDiscoveryMarkers],
  );

  /** After a card or conversation closes: celebrate once when everything has been found. */
  const maybeCelebrateExplorer = useCallback(() => {
    if (!explorerPending.current || overlayRef.current) return;
    explorerPending.current = false;
    void markExplored(ctx, childId, [EXPLORER_DONE]).then((saved) => {
      exploredRef.current = saved;
    });
    gameRef.current?.setInputEnabled(false);
    gameRef.current?.confetti();
    audio.play('fanfare', { volume: 0.7 });
    setOverlay({ kind: 'celebrate', rewardIds: [], items: [{ key: 'explorer', ...EXPLORER_CELEBRATION }] });
  }, [audio, childId, ctx]);

  // ── Dance & gym circuit on the rug ──────────────────────────────────────
  // Every number does a move; going 1 → 10 in order is "the circuit".
  const circuitRef = useRef<CircuitRun | null>(null);
  const [circuitRun, setCircuitRun] = useState<CircuitRun | null>(null);
  const [callout, setCallout] = useState<Callout | null>(null);
  const speechRef = useRef(speech);
  speechRef.current = speech;

  const setRun = useCallback((run: CircuitRun | null) => {
    circuitRef.current = run;
    setCircuitRun(run);
    gameRef.current?.setCircuitNext(run?.next ?? null);
  }, []);

  /** Digit (the numbers teacher) calls the stations — when read-aloud is on. */
  const coachSays = useCallback((text: string) => {
    const s = speechRef.current;
    if (!s.auto || !s.canSpeak) return;
    teacherForSpeech.current = 'digit';
    s.speak(text);
  }, []);

  const finishCircuit = useCallback(async () => {
    const game = gameRef.current;
    if (!game) return;
    await game.untilStill();
    game.confetti();
    const d = dataRef.current;
    const count = (d?.child.circuitsDone ?? 0) + 1;
    setCallout({ key: Date.now(), n: null, emoji: '🏅', label: count > 1 ? `The whole circuit — ${count} times!` : 'The whole circuit!', big: true });
    coachSays(CIRCUIT_DONE_LINE);
    if (d && !appStore.get().preview) {
      await updateChild(ctx, { ...d.child, circuitsDone: count });
      void reload();
    }
  }, [coachSays, ctx, reload]);

  const handleStation = useCallback(
    (n: number) => {
      const d = dataRef.current;
      if (!d) return;
      const station = circuitFor(d.child)[n - 1];
      if (!station) return;
      const { run, event } = stepOn(circuitRef.current, n);
      setRun(run);
      // The bubble stays up for the whole move (slow devices included), then a moment more.
      const key = Date.now();
      setCallout({ key, n, emoji: DANCE_MOVES[station.move].emoji, label: stationLabel(station) });
      void gameRef.current?.untilStill().then(() => {
        window.setTimeout(() => setCallout((c) => (c?.key === key ? null : c)), 1000);
      });
      coachSays(stationLine(n, station, event, run));
      void discover('circuit');
      if (event === 'complete') void finishCircuit();
    },
    [coachSays, discover, finishCircuit, setRun],
  );
  const stationRef = useRef(handleStation);
  stationRef.current = handleStation;

  useEffect(() => {
    // Station bubbles close when the move ends (above); the others after a few seconds.
    if (!callout || callout.n !== null) return;
    const t = window.setTimeout(() => setCallout(null), callout.big ? 4300 : 2700);
    return () => window.clearTimeout(t);
  }, [callout]);

  // Her family's choice of move for each number.
  const circuitMoves = data ? circuitFor(data.child).map((st) => st.move) : null;
  const circuitKey = circuitMoves?.join(',') ?? '';
  useEffect(() => {
    if (ready && circuitKey) gameRef.current?.setCircuit(circuitKey.split(',') as DanceMoveId[]);
  }, [ready, circuitKey]);

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
      // First touch: find out what this is. Teachers introduce themselves in their own conversation.
      if (await discover(id)) {
        const card = isTeacherDiscovery(id) ? null : describeDiscovery(id, { name: d.child.name, world: state, snapshot: d.snapshot });
        if (card) {
          game.setInputEnabled(false);
          setOverlay({ kind: 'discover', discovery: card });
          return;
        }
      }
      if (id === 'alphabet') {
        if (appStore.get().preview) return;
        teacherForSpeech.current = 'hoot';
        game.setInputEnabled(false);
        setOverlay({ kind: 'keyboard' });
        return;
      }
      if (id === 'circuit') {
        setRun(freshRun());
        setCallout({ key: Date.now(), n: null, emoji: '🤸', label: 'Hop onto number 1!' });
        coachSays(CIRCUIT_START_LINE);
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
        if (id !== teacher) void discover(teacher);
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
    [audio, childId, ctx, discover, coachSays, setRun],
  );

  const closeDiscovery = useCallback(
    (then?: string) => {
      setOverlay(null);
      const game = gameRef.current;
      game?.setInputEnabled(true);
      if (then === 'museum') {
        navigate({ name: 'museum', childId, tour: true });
        return;
      }
      if (then && game) {
        // Walk over and interact (goes through handleInteract, so discoveries still count).
        window.setTimeout(() => game.interactById(then), 150);
        return;
      }
      window.setTimeout(maybeCelebrateExplorer, 250);
    },
    [childId, maybeCelebrateExplorer],
  );

  // A milestone preview lasts only while the school is open.
  useEffect(() => () => appStore.set({ preview: null }), []);

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
      childName: data.child.name,
      callbacks: {
        onFocus: (f) => setFocus(f),
        onInteract: (id) => void handleInteract(id),
        onStation: (n) => stationRef.current(n),
        onBack: () => {
          const o = overlayRef.current;
          if (o && o.kind !== 'celebrate' && o.kind !== 'hoot' && o.kind !== 'lesson' && o.kind !== 'keyboard') setOverlay(null);
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
        const items = pv.celebrate
          .map(getReward)
          .filter((r) => !!r)
          .map((r) => rewardToCelebration(r!));
        if (items.length) setOverlay({ kind: 'celebrate', items, rewardIds: [] });
        else game.setInputEnabled(true);
      } else if ((data.child.explored ?? []).length === 0) {
        // Her very first visit: a welcome card instead of "welcome back".
        game.setInputEnabled(false);
        setOverlay({ kind: 'discover', discovery: welcomeDiscovery(data.child.name) });
      } else {
        setToast(`Welcome back, ${data.child.name}!`);
        window.setTimeout(() => setToast(null), 3500);
        // Celebrate anything unlocked from parent-logged activities since last visit.
        const pending = data.records.unlocks
          .filter((u) => !u.celebrated)
          .map((u) => getReward(u.rewardId))
          .filter((r) => !!r);
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
      explored: () => exploredRef.current,
      stepOn: (n: number) => gameRef.current?.stepOn(n),
      performing: () => gameRef.current?.performing ?? false,
      circuit: () => circuitRef.current,
    };
  }, [handleInteract]);

  // ── Flow completions ───────────────────────────────────────────────────
  const endConversation = useCallback(
    async (teacher: TeacherId, flow: string, transcript: TranscriptLine[], startedAt: string, outcome: string, parentNotes: string[] = []) => {
      setOverlay(null);
      const hoot = teacher === 'hoot' ? hootOutcome.current : null;
      hootOutcome.current = null;
      const talked = transcript.some((l) => l.via === 'voice' || l.via === 'typed');
      await recordConversation(ctx, childId, teacher, talked ? 'talk' : flow, startedAt, transcript, hoot ?? outcome, parentNotes);
      await reload();
      const game = gameRef.current;
      if (game) {
        await game.releaseCamera();
        game.setInputEnabled(true);
      }
      maybeCelebrateExplorer();
    },
    [ctx, childId, reload, maybeCelebrateExplorer],
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
      // The conversation itself is recorded once, when she says goodbye.
      hootOutcome.current = `Logged ${chapters} ${book?.totalChapters ? 'chapters' : 'pages'} of ${book?.title ?? 'a book'}`;
      void transcript;
      void startedAt;
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

  const startBook = useCallback(
    async (input: { title: string; author?: string; catalogId?: string }): Promise<string> => {
      const book = await addBook(ctx, childId, {
        title: input.title,
        ...(input.author ? { author: input.author } : {}),
        ...(input.catalogId ? { catalogId: input.catalogId } : {}),
        status: 'reading',
        needsParentReview: !input.catalogId,
      });
      hootOutcome.current = `Started reading ${book.title}`;
      void reload();
      return book.totalChapters
        ? `Hoo-hoo! I’ve put a bookmark in ${book.title} for you. It has ${book.totalChapters} chapters. Come tell me when you read more — or when you finish it!`
        : `Hoo-hoo! I’ve put a bookmark in ${book.title} for you. Come tell me when you read more — or when you finish it!`;
    },
    [childId, ctx, reload],
  );

  const finishLesson = useCallback(
    async (teacher: 'digit' | 'nova', run: LessonRun, transcript: TranscriptLine[], startedAt: string, parentNotes: string[] = []) => {
      const game = gameRef.current;
      if (!game || busy) return;
      setBusy(true);
      setOverlay(null);
      game.setInputEnabled(false);
      try {
        const res = await recordLesson(ctx, childId, run, startedAt, transcript, parentNotes);
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
    maybeCelebrateExplorer();
  }, [ctx, childId, maybeCelebrateExplorer]);

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
    return lessonId === 'moon-rocks'
      ? 'Thanks for helping with my moon rocks last time — the rocket is growing!'
      : 'Remember our floating experiments? I have new mysteries!';
  };
  const booksCount = data?.shelfBooks.length ?? 0;
  const metTeacher = (teacher: TeacherId) => data?.records.interactions.some((i) => i.teacherId === teacher) ?? false;
  const focusIsNew = !!focus && !preview && !!explored && (DISCOVERABLE_IDS as readonly string[]).includes(focus.id) && !explored.includes(focus.id);

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
              {!preview && explored && available.length > 0 && undiscovered(available, explored).length > 0 && (
                <button
                  type="button"
                  className="hud-chip explore"
                  data-testid="hud-discoveries"
                  title="Things discovered in my school"
                  onClick={() =>
                    setHint({
                      icon: '🧭',
                      title: 'Explore your school!',
                      text: `Look for the ✨ sparkles. You’ve discovered ${available.length - undiscovered(available, explored).length} of ${available.length} things.`,
                    })
                  }
                >
                  🧭 <strong>{available.length - undiscovered(available, explored).length}</strong>
                  <small>/ {available.length}</small>
                </button>
              )}
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

          {circuitRun && !overlay && (
            <div className="circuit-hud" data-testid="circuit-hud" role="status" aria-label={`Dance circuit: find number ${circuitRun.next}`}>
              <span className="circuit-hud-icon" aria-hidden="true">
                🤸
              </span>
              <ol className="circuit-dots" aria-hidden="true">
                {Array.from({ length: STATIONS }, (_, i) => i + 1).map((n) => (
                  <li key={n} className={n < circuitRun.next ? 'done' : n === circuitRun.next ? 'next' : ''}>
                    {n}
                  </li>
                ))}
              </ol>
              <button type="button" className="circuit-stop" aria-label="Stop the circuit" onClick={() => setRun(null)}>
                ✕
              </button>
            </div>
          )}
          {callout && !overlay && (
            <div
              key={callout.key}
              className={`circuit-callout ${callout.big ? 'big' : callout.n === null ? 'timed' : ''}`}
              data-testid="circuit-callout"
              aria-live="polite"
            >
              {callout.n !== null && <span className="circuit-callout-num">{callout.n}</span>}
              <span className="circuit-callout-emoji" aria-hidden="true">
                {callout.emoji}
              </span>
              <span className="circuit-callout-label">{callout.label}</span>
            </div>
          )}

          {showControls && !overlay && !focus && (
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
            <button
              type="button"
              className={`interact-prompt ${focusIsNew ? 'fresh' : ''}`}
              onClick={() => gameRef.current?.interactById(focus.id)}
              data-testid="interact-prompt"
            >
              <span className="interact-icon">{focus.icon}</span>
              <span className="interact-label">
                {focusIsNew ? (focus.kind === 'teacher' ? `Say hello to ${focus.label.replace(/^Talk to /, '')}!` : 'What’s this? ✨') : focus.label}
              </span>
              <kbd className="interact-key">{gameRef.current?.inputDevice === 'gamepad' ? 'A' : 'Space'}</kbd>
            </button>
          )}

          {hint && <HintCard {...hint} onClose={() => setHint(null)} />}

          {overlay?.kind === 'keyboard' && (
            <KeyboardFlow
              speech={speech}
              completed={data.records.lessons.filter((l) => l.lessonId === 'keyboard-trail').length}
              onClose={closeSheet}
              onSave={async (run) => {
                await recordKeyboardTrail(ctx, childId, run);
                await reload();
              }}
            />
          )}
          {overlay?.kind === 'hoot' && (
            <HootFlow
              childName={data.child.name}
              books={data.records.books}
              mastery={data.records.mastery}
              visitsToday={visitsToday('hoot')}
              firstMeeting={!metTeacher('hoot')}
              speech={speech}
              playSfx={(n) => audio.play(n)}
              onFinishBook={(input) => void finishBook(input)}
              onReadMore={readMore}
              onStartBook={startBook}
              onClose={(t, s, notes) => void endConversation('hoot', 'chat', t, s, 'Visited Professor Hoot', notes)}
              talk={talkKit}
            />
          )}
          {overlay?.kind === 'lesson' && (
            <LessonFlow
              teacher={overlay.teacher}
              lesson={getLesson(overlay.teacher === 'digit' ? 'moon-rocks' : 'sink-float')!}
              startTier={overlay.startTier}
              visitsToday={visitsToday(overlay.teacher)}
              firstMeeting={!metTeacher(overlay.teacher)}
              childName={data.child.name}
              {...(lastSummary(overlay.teacher === 'digit' ? 'moon-rocks' : 'sink-float')
                ? { lastSummary: lastSummary(overlay.teacher === 'digit' ? 'moon-rocks' : 'sink-float')! }
                : {})}
              speech={speech}
              playSfx={(n) => audio.play(n)}
              onComplete={(run, t, s, notes) => void finishLesson(overlay.teacher, run, t, s, notes)}
              onClose={(t, s, notes) => void endConversation(overlay.teacher, 'chat', t, s, `Visited ${TEACHERS[overlay.teacher].name}`, notes)}
              talk={talkKit}
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
          {overlay?.kind === 'discover' && (
            <DiscoveryCard
              discovery={overlay.discovery}
              found={available.length - undiscovered(available, explored ?? []).length}
              total={overlay.discovery.id === '__welcome' ? 0 : available.length}
              {...(speech.canSpeak ? { speak: speech.speak } : {})}
              autoSpeak={speech.auto}
              onClose={() => closeDiscovery()}
              onAction={(target) => closeDiscovery(target)}
            />
          )}
        </>
      )}
    </div>
  );
}
