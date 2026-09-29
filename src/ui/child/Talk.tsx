/**
 * Talking to teachers: a big microphone button (speech-to-text), a typing
 * fallback, and a hook that runs a free conversation through the teacher
 * chat service (on-device, or an AI teacher when a parent turned it on).
 */
import { useRef, useState } from 'react';
import { EMPTY_TOPIC, nextTopic, type ChatTopic, type ChatTurn, type TeacherChatReply, type TeacherChatService } from '../../domain/teachers/chat';
import type { TeacherId } from '../../domain/teachers/teachers';
import type { BookStatus, TranscriptLine } from '../../domain/types';
import type { ListenError, ListenOutcome } from '../../voice/SpeechService';
import { Icon } from '../shared/Icon';

/** What first-time setup found: ready to listen, still downloading the voice pack, or not possible here. */
export type MicSetup = 'ready' | 'downloading' | 'unsupported';

/**
 * The microphone as child mode sees it. It is shown whenever talking isn't
 * turned off; the first tap does any setup (asks the browser, downloads the
 * on-device voice pack), and if listening can't work here, a tap explains why.
 */
export interface Mic {
  onDevice: boolean;
  /** The first tap sets things up before listening. */
  needsSetup: boolean;
  /** Why it can't listen here (shown when tapped), or null. */
  blocked: string | null;
  prepare(): Promise<MicSetup>;
  listen(opts: { phrases?: string[]; onInterim?: (text: string) => void }): Promise<ListenOutcome>;
  stop(): void;
}

export const MIC_NEEDS_GROWNUP = 'A grown-up can turn on my ears in Settings → Talking to teachers. You can type for now!';
export const MIC_NO_BROWSER_SUPPORT = 'My ears don’t work in this browser — a grown-up can open the school in Chrome. You can type for now!';

/** Everything a teacher conversation needs for talking. */
export interface TalkKit {
  mic: Mic | null;
  chat: TeacherChatService;
  phrases: string[];
  /** Says a reply out loud when she used her voice (even if read-aloud is off). */
  speakReply(text: string): void;
  /** Whether lines are already read aloud automatically. */
  autoSpeaks: boolean;
}

const MIC_TROUBLE: Record<ListenError, string> = {
  'no-speech': 'I didn’t hear anything. Tap the microphone and talk!',
  'not-allowed': 'The microphone needs a grown-up’s OK first. You can type instead!',
  'no-microphone': 'I can’t find a microphone. You can type instead!',
  network: 'My ears aren’t working right now. You can type instead!',
  unavailable: 'My ears aren’t working right now. You can type instead!',
  aborted: 'Oops! Tap the microphone and try again.',
};

/** One tap to talk, tap again to finish. Calls onHeard with the words. */
export function MicButton({
  mic,
  phrases,
  label,
  onHeard,
  onInterim,
  onTrouble,
  disabled,
  size = 'big',
  onPreparing,
}: {
  mic: Mic;
  phrases?: string[];
  label: string;
  onHeard: (text: string) => void;
  onInterim?: (text: string) => void;
  onTrouble?: (message: string) => void;
  disabled?: boolean;
  size?: 'big' | 'round';
  /** Called while first-time setup runs (true) and when it ends (false). */
  onPreparing?: (preparing: boolean) => void;
}) {
  const [listening, setListening] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const toggle = async () => {
    if (preparing) return;
    if (listening) {
      mic.stop();
      return;
    }
    if (mic.blocked) {
      onTrouble?.(mic.blocked);
      return;
    }
    if (mic.needsSetup) {
      setPreparing(true);
      onPreparing?.(true);
      const setup = await mic.prepare();
      setPreparing(false);
      onPreparing?.(false);
      if (setup !== 'ready') {
        onTrouble?.(setup === 'downloading' ? 'My ears are still getting ready. Try again in a minute!' : MIC_NEEDS_GROWNUP);
        return;
      }
    }
    setListening(true);
    onInterim?.('');
    const out = await mic.listen({ ...(phrases ? { phrases } : {}), ...(onInterim ? { onInterim } : {}) });
    setListening(false);
    onInterim?.('');
    const text = out.result?.transcript.trim();
    if (text) onHeard(text);
    else onTrouble?.(MIC_TROUBLE[out.error ?? 'no-speech']);
  };
  return (
    <button
      type="button"
      className={`mic-btn ${size === 'round' ? 'mic-round' : ''} ${listening ? 'on' : ''} ${preparing ? 'preparing' : ''}`}
      onClick={() => void toggle()}
      disabled={disabled && !listening}
      aria-pressed={listening}
      aria-busy={preparing}
      aria-label={listening ? 'Listening — tap when you are done' : preparing ? 'Getting ready to listen' : label}
      data-testid="mic-btn"
    >
      <Icon name="mic" size={size === 'round' ? 34 : 28} />
      {size === 'big' && <span>{listening ? 'Listening… tap when done' : preparing ? 'Getting my ears ready…' : label}</span>}
    </button>
  );
}

/** Microphone + "or type it" box + what she said, under a teacher's line. */
export function TalkBar({
  kit,
  teacherName,
  onSay,
  busy,
}: {
  kit: TalkKit;
  teacherName: string;
  onSay: (text: string, via: 'voice' | 'typed') => void;
  busy?: boolean;
}) {
  const [text, setText] = useState('');
  const [live, setLive] = useState('');
  const [trouble, setTrouble] = useState('');
  const [preparing, setPreparing] = useState(false);
  const send = (t: string, via: 'voice' | 'typed') => {
    const clean = t.trim();
    if (!clean || busy) return;
    setTrouble('');
    setLive('');
    setText('');
    onSay(clean, via);
  };
  return (
    <div className="talk-bar" data-testid="talk-bar">
      <form
        className="talk-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(text, 'typed');
        }}
      >
        {kit.mic && (
          <MicButton
            mic={kit.mic}
            phrases={kit.phrases}
            label={`Talk to ${teacherName}`}
            size="round"
            disabled={busy}
            onInterim={setLive}
            onTrouble={setTrouble}
            onPreparing={(p) => {
              setPreparing(p);
              if (p) setTrouble('');
            }}
            onHeard={(t) => send(t, 'voice')}
          />
        )}
        <input
          className="talk-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kit.mic ? `Tap the microphone — or type to ${teacherName}` : `Tell ${teacherName} something…`}
          aria-label={`Tell ${teacherName} something`}
          data-testid="talk-input"
          maxLength={300}
          disabled={busy}
        />
        <button type="submit" className="talk-send" disabled={!text.trim() || busy} aria-label="Send" data-testid="talk-send">
          <Icon name="arrowRight" size={26} />
        </button>
      </form>
      {(live || busy || trouble || preparing) && (
        <div className="talk-status" aria-live="polite" data-testid="talk-status">
          {preparing ? (
            <span className="talk-live">Getting my ears ready… the very first time can take a minute.</span>
          ) : live ? (
            <span className="talk-live">
              <Icon name="mic" size={16} /> {live}
            </span>
          ) : busy ? (
            <span className="talk-thinking" aria-label={`${teacherName} is thinking`}>
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span className="talk-trouble">{trouble}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Runs one free conversation with a teacher, remembering what book it is about. */
export function useTeacherTalk(opts: {
  teacher: TeacherId;
  childName: string;
  books: { id: string; title: string; status: BookStatus }[];
  kit: TalkKit;
  /** The conversation so far (the flow's transcript). */
  transcript: () => TranscriptLine[];
  log: (speaker: TranscriptLine['speaker'], text: string, via?: TranscriptLine['via']) => void;
}) {
  const [topic, setTopic] = useState<ChatTopic>(EMPTY_TOPIC);
  const topicRef = useRef<ChatTopic>(EMPTY_TOPIC);
  const [thinking, setThinking] = useState(false);
  const [lastReply, setLastReply] = useState<TeacherChatReply | null>(null);
  const notes = useRef<string[]>([]);

  const send = async (text: string, via?: 'voice' | 'typed'): Promise<TeacherChatReply> => {
    const history: ChatTurn[] = opts
      .transcript()
      .filter((l) => l.speaker !== 'system')
      .slice(-8)
      .map((l) => ({ speaker: l.speaker === 'teacher' ? 'teacher' : 'child', text: l.text }));
    opts.log('child', text, via);
    setThinking(true);
    const reply = await opts.kit.chat.respond({
      teacherId: opts.teacher,
      childName: opts.childName,
      utterance: text,
      history,
      books: opts.books,
      ...(topicRef.current.book ? { topic: topicRef.current.book } : {}),
    });
    setThinking(false);
    topicRef.current = nextTopic(topicRef.current, reply);
    setTopic(topicRef.current);
    if (reply.parentNote) notes.current.push(reply.parentNote);
    setLastReply(reply);
    if (via === 'voice' && !opts.kit.autoSpeaks) opts.kit.speakReply(reply.reply);
    return reply;
  };

  /** She answered with a button ("Yes, the whole book!"), so we know for sure. */
  const markFinished = (finished: boolean) => {
    if (!topicRef.current.book) return;
    topicRef.current = { ...topicRef.current, finished };
    setTopic(topicRef.current);
  };

  return { send, markFinished, topic, thinking, lastReply, notes: notes.current };
}
