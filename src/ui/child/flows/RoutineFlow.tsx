import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import {
  RoutineRun,
  REFLECTIONS,
  modelRoutineOrder,
  placeRoutineCard,
  type RoutineModality,
  type RoutineReflection,
  type RoutineSize,
} from '../../../domain/lessons/routine';
import { DialogueShell, type Speech } from '../DialogueShell';
import { RoutinePicture } from '../lesson/RoutinePicture';

type Phase = 'intro' | 'play' | 'feedback' | 'complete';
export function RoutineFlow({
  childId,
  speech,
  onSave,
  onClose,
}: {
  childId: string;
  speech: Speech;
  onSave: (run: RoutineRun) => Promise<void>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [line, setLine] = useState('Hello! I’m Tavi. Let’s arrange pretend picture steps, then try a little change. We can take our time.');
  const [choices, setChoices] = useState(false);
  const [order, setOrder] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [model, setModel] = useState<string[] | null>(null);
  const [hint, setHint] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reflection, setReflection] = useState<RoutineReflection | null>(null);
  const run = useRef<RoutineRun | null>(null);
  const phaseRef = useRef<Phase>('intro');
  const busy = useRef(false);
  const active = useRef(true);
  const pauseRef = useRef(false);
  const pointer = useRef<RoutineModality>('pointer');
  const task = useRef<NonNullable<RoutineRun['current']> | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const setPhaseNow = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const close = () => {
    if (busy.current || !active.current) return;
    if (run.current) run.current.cancelled = true;
    active.current = false;
    onClose();
  };
  const resetTask = () => {
    task.current = run.current?.current ?? null;
    setOrder(Array(task.current?.size ?? 2).fill(null));
    setSelected(null);
    setModel(null);
    setHint(false);
    setLine(
      task.current
        ? `${task.current.title}. Choose a picture, then a numbered space.`
        : 'You explored two pretend routines. You can save them or leave without saving.',
    );
    setPhaseNow(task.current ? 'play' : 'complete');
  };
  const start = (size: RoutineSize) => {
    if (busy.current || !active.current) return;
    run.current = new RoutineRun(childId, size, Date.now() % 100000);
    setReflection(null);
    pauseRef.current = false;
    setPaused(false);
    resetTask();
  };
  useEffect(() => {
    active.current = true;
    const pause = () => {
      if (phaseRef.current === 'play' || phaseRef.current === 'feedback') {
        pauseRef.current = true;
        setPaused(true);
      }
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', key);
    return () => {
      active.current = false;
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', key);
    };
  }, []);
  const observePointer = (e: PointerEvent) => {
    pointer.current = e.pointerType === 'touch' ? 'touch' : 'pointer';
  };
  const modality = (e: MouseEvent) => {
    run.current?.noteModality(e.detail === 0 ? 'keyboard-or-assistive' : pointer.current);
  };
  const canAct = () => active.current && !busy.current && !pauseRef.current && phaseRef.current === 'play';
  const check = () => {
    if (!canAct() || !run.current) return;
    const result = run.current.submit(order);
    if (result === 'incomplete') setLine('A picture goes in each space. You can take your time.');
    else if (result === 'invalid') {
      setLine('Let’s look again. Something needs to happen before another step. A hint or model can help.');
      setHint(true);
    } else if (result === 'valid') {
      setLine('That order fits our pretend task! Some steps can work in more than one order.');
      setSelected(null);
      setPhaseNow('feedback');
    }
  };
  const save = async (next: RoutineSize | 'finish') => {
    const current = run.current;
    if (!active.current || busy.current || phaseRef.current !== 'complete' || !current?.complete) return;
    busy.current = true;
    setSaving(true);
    current.reflection = reflection;
    try {
      await onSave(current);
      if (!active.current) return;
      if (next === 'finish') {
        active.current = false;
        onClose();
      } else {
        busy.current = false;
        start(next);
      }
    } catch {
      if (active.current) setLine('Your pictures are still here. Saving did not finish. Try Save again when you’re ready.');
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  };
  const current = task.current;
  const disabled = phase !== 'play' || paused || saving;
  const selectedLabel = current?.cards.find((c) => c.id === selected)?.label;
  return (
    <DialogueShell teacher="tavi" line={line} speech={speech} onClose={close} closeDisabled={saving} wide={phase !== 'intro'}>
      <div className="routine-flow" ref={panel} data-testid="routine-flow">
        {phase === 'intro' && (
          <>
            <p>Pictures show each pretend action. There’s no reading test, timer or sound requirement. A grown-up may help describe the pictures.</p>
            <button type="button" className="btn btn-primary" onClick={() => start(2)} data-testid="routine-start-2">
              Two pictures · Start here
            </button>
            <button type="button" className="btn" onClick={() => setChoices(!choices)} aria-expanded={choices}>
              Learner / grown-up level choice
            </button>
            {choices && (
              <div className="routine-tools">
                <button type="button" className="btn" onClick={() => start(3)} data-testid="routine-start-3">
                  Three pictures
                </button>
                <button type="button" className="btn" onClick={() => start(4)} data-testid="routine-start-4">
                  Four pictures
                </button>
              </div>
            )}
            <button type="button" className="btn" onClick={close}>
              Maybe later
            </button>
          </>
        )}
        {(phase === 'play' || phase === 'feedback') && current && (
          <>
            <p className="routine-round" data-testid="routine-round">
              Round {(run.current?.trials.length ?? 0) + (phase === 'play' ? 1 : 0)} of 2 · {current.size} pictures
            </p>
            <h3>{current.title}</h3>
            <p>{current.instruction}</p>
            {paused && (
              <div className="routine-pause" role="status">
                Your pictures are waiting.
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    pauseRef.current = false;
                    setPaused(false);
                  }}
                >
                  Resume pictures
                </button>
              </div>
            )}
            <div className="routine-pool" role="group" aria-label="Choose a picture">
              {current.cards.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  data-testid={`routine-card-${card.id}`}
                  className="routine-card"
                  aria-label={`Select: ${card.label}`}
                  aria-pressed={selected === card.id}
                  disabled={disabled}
                  onPointerDown={observePointer}
                  onClick={(event) => {
                    if (!canAct()) return;
                    modality(event);
                    setSelected(card.id);
                    setLine(`${card.label}. Now choose a space.`);
                  }}
                >
                  <RoutinePicture picture={card.picture} />
                  <span>{card.label}</span>
                  {order.includes(card.id) && <small>In space {order.indexOf(card.id) + 1}</small>}
                </button>
              ))}
            </div>
            <p className="routine-help">① Choose a picture. ② Choose a space. Choose again to move or swap. Tab and Enter / Space work too.</p>
            <ol className="routine-order" aria-label="Your picture order">
              {order.map((id, index) => {
                const card = current.cards.find((c) => c.id === id);
                return (
                  <li key={index}>
                    <button
                      type="button"
                      className="routine-slot"
                      data-testid={`routine-slot-${index}`}
                      disabled={disabled || !selected}
                      onPointerDown={observePointer}
                      aria-label={`Space ${index + 1}${card ? `: ${card.label}` : ': empty'}${selectedLabel ? `. Move ${selectedLabel} here` : ''}`}
                      onClick={(event) => {
                        if (!canAct() || !selected) return;
                        modality(event);
                        setOrder(placeRoutineCard(current, order, selected, index));
                        setSelected(null);
                        setLine(`Picture in space ${index + 1}. You can change it or check your order.`);
                      }}
                    >
                      <strong>{index + 1}</strong>
                      {card ? (
                        <RoutinePicture picture={card.picture} />
                      ) : (
                        <span className="routine-empty" aria-hidden="true">
                          ＋
                        </span>
                      )}
                      <span>{card?.label ?? 'Put picture here'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {hint && (
              <div className="routine-hint" aria-label="Before and after picture clue">
                <p>One clue: this picture needs to come before this one.</p>
                <span className="sr-only">
                  {current.cards.find((c) => c.id === current.edges[0]![0])!.label} before {current.cards.find((c) => c.id === current.edges[0]![1])!.label}.
                </span>
                <div>
                  <RoutinePicture picture={current.cards.find((c) => c.id === current.edges[0]![0])!.picture} />
                  <span aria-hidden="true">→</span>
                  <RoutinePicture picture={current.cards.find((c) => c.id === current.edges[0]![1])!.picture} />
                </div>
              </div>
            )}
            {model && (
              <div className="routine-model" aria-label="One valid picture model">
                <p>One way that works. Other orders may work too.</p>
                <div>
                  {model.map((id, i) => (
                    <span key={id}>
                      <b>{i + 1}</b>
                      <RoutinePicture picture={current.cards.find((c) => c.id === id)!.picture} />
                      <span className="sr-only">{current.cards.find((c) => c.id === id)!.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {phase === 'feedback' ? (
              <button
                type="button"
                className="btn btn-primary"
                data-testid="routine-next"
                disabled={paused}
                onClick={() => {
                  if (!active.current || pauseRef.current || phaseRef.current !== 'feedback') return;
                  resetTask();
                }}
              >
                Continue when ready →
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-primary" disabled={disabled} onClick={check} data-testid="routine-check">
                  Check my order
                </button>
                <div className="routine-tools">
                  <button
                    type="button"
                    className="btn"
                    disabled={disabled}
                    onClick={() => {
                      if (!canAct()) return;
                      run.current?.support('hint');
                      setHint(true);
                      setLine('Look at the before-and-after picture clue.');
                    }}
                  >
                    💡 Hint
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={disabled}
                    onClick={() => {
                      if (!canAct()) return;
                      run.current?.support('model');
                      setModel(modelRoutineOrder(current));
                      setLine('Here is one way. You can use these pictures to build your order.');
                    }}
                  >
                    👀 Show a model
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={disabled}
                    onClick={() => {
                      if (!canAct()) return;
                      run.current?.simpler();
                      resetTask();
                      setLine('We left the unfinished bigger task. Let’s use two pictures together.');
                    }}
                  >
                    Simpler · restart this round
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={disabled}
                    onClick={() => {
                      if (!canAct()) return;
                      run.current?.support('grown-up');
                      setLine('We’ll record that someone helped with these pictures.');
                    }}
                  >
                    A grown-up helped
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={disabled}
                    onClick={() => {
                      if (!canAct()) return;
                      run.current?.skip();
                      setLine('We can leave that one for another time.');
                      setPhaseNow('feedback');
                    }}
                  >
                    Skip this round
                  </button>
                </div>
              </>
            )}
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => {
                if (!active.current || busy.current) return;
                const size = run.current?.size ?? 2;
                if (run.current) run.current.cancelled = true;
                start(size);
              }}
            >
              Replay · discard this run
            </button>
          </>
        )}
        {phase === 'complete' && (
          <>
            <h3>Two pretend routines explored</h3>
            <p>Only picture ordering is recorded. This doesn’t judge how you do things at home.</p>
            <fieldset disabled={saving}>
              <legend>Optional: what helped you think? No right answer.</legend>
              <div className="routine-tools">
                {(Object.entries(REFLECTIONS) as [RoutineReflection, string][]).map(([id, label]) => (
                  <button type="button" className="btn" key={id} aria-pressed={reflection === id} onClick={() => setReflection(reflection === id ? null : id)}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="routine-tools">
              <button type="button" className="btn btn-primary" disabled={saving} data-testid="routine-save" onClick={() => void save('finish')}>
                {saving ? 'Saving…' : 'Save & finish'}
              </button>
              <button type="button" className="btn" disabled={saving} onClick={() => void save(run.current?.size ?? 2)}>
                Save & play again
              </button>
              {run.current?.suggestedSize && (
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  data-testid="routine-next-level"
                  onClick={() => {
                    const size = run.current?.suggestedSize;
                    if (size) void save(size);
                  }}
                >
                  Save & try {run.current.suggestedSize} pictures
                </button>
              )}
              <button type="button" className="btn" disabled={saving} onClick={close}>
                Leave without saving
              </button>
            </div>
          </>
        )}
      </div>
    </DialogueShell>
  );
}
