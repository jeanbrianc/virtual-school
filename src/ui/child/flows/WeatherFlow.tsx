import { useEffect, useRef, useState } from 'react';
import { WeatherRun, weatherLesson, WEATHER_CEILING } from '../../../domain/lessons/weather';
import type { Problem } from '../../../domain/lessons/types';
import { hashString } from '../../../domain/util/random';
import { Choices, DialogueShell, type Speech } from '../DialogueShell';
import { WeatherPicture, WeatherStage } from '../lesson/WeatherPicture';

type Phase = 'intro' | 'play' | 'feedback' | 'complete' | 'discard';
type Destination = 'close' | 'replay' | 'level';
export interface WeatherFlowProps {
  childId: string;
  speech: Speech & { cancel(): void };
  onSave(run: WeatherRun, startedAt: string): Promise<void>;
  onClose(): void;
  onChooseActivity(): void;
}
/** A separate fixed-content flow: no chat, microphone, location, provider, or placement inference. */
export function WeatherFlow({ childId, speech, onSave, onClose, onChooseActivity }: WeatherFlowProps) {
  const session = useRef({ active: true, version: 0, run: null as WeatherRun | null, startedAt: '', saving: false, replay: 0 });
  const [, render] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [line, setLine] = useState(weatherLesson.intro[0]!);
  const [picture, setPicture] = useState<Problem | null>(null);
  const [round, setRound] = useState(0);
  const [model, setModel] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [destination, setDestination] = useState<Destination>('close');
  const [beforeDiscard, setBeforeDiscard] = useState<Phase>('play');
  const [beforeDiscardLine, setBeforeDiscardLine] = useState('');
  const liveSpeech = useRef(speech);
  liveSpeech.current = speech;
  const [saving, setSaving] = useState(false);
  const version = session.current.version;
  const valid = () => session.current.active && !session.current.saving && session.current.version === version;
  const changed = () => {
    session.current.version++;
    render((n) => n + 1);
    speech.cancel();
  };
  useEffect(() => {
    const current = session.current;
    current.active = true;
    const blur = () => liveSpeech.current.cancel();
    window.addEventListener('blur', blur);
    return () => {
      current.active = false;
      current.version++;
      liveSpeech.current.cancel();
      window.removeEventListener('blur', blur);
    };
  }, []);
  // Replacing audio settings cancels the old narration without invalidating this run.
  useEffect(() => () => speech.cancel(), [speech]);
  const leave = () => {
    session.current.active = false;
    speech.cancel();
    onClose();
  };
  const start = (tier: number) => {
    changed();
    const current = session.current;
    current.startedAt = new Date().toISOString();
    current.replay++;
    current.run = new WeatherRun(childId, tier, hashString(`${current.startedAt}:${current.replay}`));
    setPicture(current.run.currentProblem());
    setRound(0);
    setModel(false);
    setWrong(null);
    setPhase('play');
    setLine(current.run.currentProblem()!.prompt);
  };
  const advance = () => {
    changed();
    const run = session.current.run!;
    setModel(false);
    setWrong(null);
    if (run.isComplete) {
      setPhase('complete');
      setPicture(null);
      setLine('You finished four picture rounds. Review this level or try the other one.');
    } else {
      setPicture(run.currentProblem());
      setRound(run.roundIndex);
      setPhase('play');
      setLine(run.currentProblem()!.prompt);
    }
  };
  const save = async (next: Destination) => {
    if (!valid()) return;
    const current = session.current,
      run = current.run;
    if (!run?.isComplete) return;
    current.saving = true;
    setSaving(true);
    speech.cancel();
    try {
      await onSave(run, current.startedAt);
    } catch {
      if (current.active && current.version === version) {
        setPhase('complete');
        setPicture(null);
        setLine('Your finished work is still here. Saving did not work. Choose a save button to try again.');
      }
      return;
    } finally {
      current.saving = false;
      if (current.active) setSaving(false);
    }
    if (!current.active || current.version !== version || current.run !== run) return;
    if (next === 'close') leave();
    else start(next === 'level' ? 1 - run.startTier : run.startTier);
  };
  const request = (next: Destination) => {
    if (!valid() || phase === 'discard') return;
    if (session.current.run?.isComplete) {
      void save(next);
      return;
    }
    if (phase === 'intro') {
      leave();
      return;
    }
    changed();
    setDestination(next);
    setBeforeDiscard(phase);
    setBeforeDiscardLine(line);
    setPhase('discard');
    setLine('Leave these unfinished picture rounds? Their choices will be discarded and no science performance will be saved.');
  };
  return (
    <DialogueShell
      teacher="nova"
      line={line}
      onClose={() => request('close')}
      closeDisabled={saving}
      speech={speech}
      wide={phase === 'play' || phase === 'feedback'}
    >
      {phase === 'intro' && (
        <>
          <Choices
            items={[
              { id: 'weather-level-0', label: weatherLesson.tiers[0]!.label, icon: '☀️', tone: 'primary' },
              { id: 'weather-level-1', label: weatherLesson.tiers[1]!.label, icon: '📊' },
              { id: 'weather-later', label: 'Maybe later', icon: '👋' },
            ]}
            onPick={(id) => {
              if (!valid()) return;
              if (id === 'weather-later') leave();
              else start(id === 'weather-level-1' ? 1 : 0);
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!valid()) return;
              session.current.active = false;
              speech.cancel();
              onChooseActivity();
            }}
          >
            Choose an activity
          </button>
          <p className="weather-note">Pictures and tap or keyboard choices work without audio. A grown-up can read the short prompt if needed.</p>
        </>
      )}
      {(phase === 'play' || phase === 'feedback') && picture?.visual.type === 'weather' && (
        <div className="weather-play">
          <p className="weather-progress" aria-label={`Round ${round + 1} of 4`}>
            {' '}
            {round + 1} / 4 · {weatherLesson.tiers[session.current.run!.startTier]!.label}
          </p>
          <WeatherStage pictures={picture.visual.pictures} chart={picture.visual.chart} {...(model ? { modelAnswer: picture.answerId } : {})} />
          <div className="weather-choices" aria-label="Sky picture choices">
            {picture.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                data-testid={`weather-choice-${choice.id}`}
                aria-label={`Choose ${choice.label}`}
                disabled={phase !== 'play' || wrong === choice.id}
                className={`weather-choice ${model && picture.answerId === choice.id ? 'weather-supported' : ''}`}
                onClick={() => {
                  if (!valid() || phase !== 'play' || !session.current.run || session.current.run.currentProblem()?.id !== picture.id) return;
                  const feedback = session.current.run.answer(choice.id);
                  changed();
                  setLine(feedback.message);
                  if (feedback.problemFinished) setPhase('feedback');
                  else setWrong(choice.id);
                }}
              >
                {choice.weatherPicture && <WeatherPicture picture={choice.weatherPicture} />}
                <span>{choice.label}</span>
              </button>
            ))}
          </div>
          {model && (
            <div className="weather-model" role="status" aria-label="Worked sky picture model">
              {picture.model}
            </div>
          )}
          {phase === 'feedback' ? (
            <button
              type="button"
              className="btn btn-primary weather-next"
              data-testid="weather-next"
              onClick={() => {
                if (valid()) advance();
              }}
            >
              Next picture →
            </button>
          ) : (
            <div className="weather-controls">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!valid()) return;
                  changed();
                  setLine(session.current.run!.hint().message);
                }}
              >
                💡 Hint
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!valid()) return;
                  changed();
                  setLine(session.current.run!.model().message);
                  setModel(true);
                }}
              >
                👀 Show the model
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!valid()) return;
                  session.current.run!.skip();
                  advance();
                }}
              >
                Skip this round
              </button>
            </div>
          )}
          {!session.current.run?.isComplete && (
            <button type="button" className="btn weather-switch" onClick={() => request('level')}>
              Change level · discard unfinished rounds
            </button>
          )}
        </div>
      )}
      {phase === 'discard' && (
        <Choices
          items={[
            { id: 'weather-keep', label: 'Keep playing', icon: '↩️', tone: 'primary' },
            { id: 'weather-discard', label: destination === 'level' ? 'Discard & change level' : 'Discard & leave', icon: '🚪' },
          ]}
          onPick={(id) => {
            if (!valid()) return;
            if (id === 'weather-keep') {
              changed();
              setPhase(beforeDiscard);
              setLine(beforeDiscardLine);
            } else if (destination === 'level') start(1 - session.current.run!.startTier);
            else leave();
          }}
        />
      )}
      {phase === 'complete' && (
        <div className="weather-complete">
          <h2>{weatherLesson.completeTitle}</h2>
          <p className="weather-ceiling">{WEATHER_CEILING}</p>
          <p>Gentle review: revisit the same pictures, ask for the model, or try the other level. There is no automatic move to a harder level.</p>
          <Choices
            items={[
              { id: 'weather-finish', label: 'Save & finish', icon: '🌤️', tone: 'primary' },
              { id: 'weather-replay', label: 'Save & review this level', icon: '🔁' },
              { id: 'weather-level', label: 'Save & try the other level', icon: '📊' },
            ]}
            state={saving ? { 'weather-finish': 'disabled', 'weather-replay': 'disabled', 'weather-level': 'disabled' } : {}}
            onPick={(id) => void save(id === 'weather-replay' ? 'replay' : id === 'weather-level' ? 'level' : 'close')}
          />
          {saving && <p role="status">Saving your picture work…</p>}
        </div>
      )}
    </DialogueShell>
  );
}
