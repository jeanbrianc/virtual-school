import { useRef, useState } from 'react';
import { COUNTRY_TARGETS } from '../../../domain/geography/objectives';
import maps from '../../../domain/geography/maps.json';
import { stateShapeAdventure, stateShapeViewBox } from '../../../domain/geography/stateChoices';
import type { PracticeProgress } from '../../../services/practiceService';
import type { ProblemAttemptRecord } from '../../../domain/types';
import { Choices, DialogueShell, type Speech } from '../DialogueShell';

export function GlobeFlow({ speech, onClose, onRecord }: { speech: Speech; onClose: () => void; onRecord: (progress: PracticeProgress) => Promise<void> }) {
  const session = useRef({ id: `practice_${crypto.randomUUID()}`, startedAt: new Date().toISOString(), problems: [] as ProblemAttemptRecord[] });
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const responses = useRef<string[]>([]);
  const [mode, setMode] = useState<'shapes' | 'states' | 'countries' | null>('shapes');
  const [shapeRounds, setShapeRounds] = useState(() => stateShapeAdventure(Math.random));
  const [showNames, setShowNames] = useState(false);
  const [round, setRound] = useState(0);
  const [found, setFound] = useState(false);
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const regions = mode && mode !== 'shapes' ? maps[mode].filter((r) => mode === 'states' || (COUNTRY_TARGETS as readonly string[]).includes(r.name)) : [];
  const shapeChoices = shapeRounds[round]?.choices ?? [];
  const target = (mode === 'shapes' ? shapeRounds[round]?.target : targets[round]) ?? '';
  const complete = round === 5;
  const question = mode === 'shapes' ? `Which state is ${target}? Choose its shape!` : `Can you find ${target}? Tap it on the map!`;
  const line = !mode ? 'Let’s explore! Pick a map.' : complete ? 'Five rounds explored! Your adventure is saved.' : feedback || question;
  const start = (id: string) => {
    if (saveLock.current) return;
    session.current = { id: `practice_${crypto.randomUUID()}`, startedAt: new Date().toISOString(), problems: [] };
    responses.current = [];
    const next = id === 'shapes' ? 'shapes' : id === 'states' ? 'states' : 'countries';
    const pool = maps[next === 'shapes' ? 'states' : next].filter((r) => next !== 'countries' || (COUNTRY_TARGETS as readonly string[]).includes(r.name));
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    setTargets(
      next === 'states'
        ? [
            'Michigan',
            ...shuffled
              .filter((r) => r.name !== 'Michigan')
              .slice(0, 4)
              .map((r) => r.name),
          ]
        : shuffled.slice(0, 5).map((r) => r.name),
    );
    setMode(next);
    setShapeRounds(stateShapeAdventure(Math.random));
    setShowNames(false);
    setRound(0);
    setFound(false);
    setHint(false);
    setFeedback('');
  };
  const pick = (name: string, skipped = false) => {
    void (async () => {
      if (found || saveLock.current) return;
      if (!mode || complete || (!skipped && !(mode === 'shapes' ? shapeChoices : regions).some((r) => r.name === name))) return;
      if (!skipped) responses.current.push(name);
      if (!skipped && name !== target) {
        setFeedback(`That’s ${name}. Let’s look for ${target} together!`);
        return;
      }
      saveLock.current = true;
      setSaving(true);
      const record: ProblemAttemptRecord = {
        problemId: `round-${round}`,
        skillId: mode === 'shapes' ? 'geography.state-shapes' : mode === 'states' ? 'geography.states' : 'geography.countries',
        tier: mode === 'shapes' ? 0 : 1,
        prompt: mode === 'shapes' ? `Choose ${target} from three state outlines` : `Find ${target}`,
        responses: [...responses.current],
        scaffolds: [...(hint ? ['highlighted target'] : []), ...(showNames ? ['state names shown'] : [])],
        outcome: skipped ? 'skipped' : hint || showNames || responses.current.length > 1 ? 'supported' : 'independent',
      };
      const problems = [...session.current.problems, record];
      try {
        await onRecord({ ...session.current, lessonId: mode === 'countries' ? 'globe-countries' : 'globe-states', problems, complete: round === 4 });
        session.current.problems = problems;
        setFound(true);
        setFeedback(skipped ? `We skipped ${target}. You can explore it another time.` : `Yes! That’s ${target}! 🌟`);
      } catch {
        if (!skipped) responses.current.pop();
        setFeedback('Your round could not be saved. Please ask a grown-up, or tap the place again to retry.');
      } finally {
        saveLock.current = false;
        setSaving(false);
      }
    })();
  };
  return (
    <DialogueShell teacher="nova" line={line} speech={speech} onClose={onClose} closeDisabled={saving} wide>
      {saving && <p role="status">Saving your learning…</p>}
      {!mode || complete ? (
        <Choices
          items={[
            { id: 'shapes', label: 'Three state shapes · Level 1', icon: '🧩' },
            { id: 'states', label: 'Whole US map · Level 2', icon: '🇺🇸' },
            { id: 'countries', label: 'World countries · harder', icon: '🌍' },
          ]}
          onPick={start}
        />
      ) : (
        <>
          <p>🌟 {round + (found ? 1 : 0)} / 5 rounds explored</p>
          {mode === 'shapes' && <p>Level 1 · Three state shapes</p>}
          {mode === 'states' && <p>Level 2 · Whole US map</p>}
          {speech.canSpeak && (
            <button type="button" className="btn" onClick={() => speech.speak(question)}>
              Read the question again
            </button>
          )}
          {mode === 'shapes' ? (
            <>
              <div className="geography-shape-choices" role="group" aria-label="Three state shapes">
                {shapeChoices.map((region, index) => (
                  <button
                    type="button"
                    key={region.name}
                    className={`geography-shape-choice ${(hint || found) && region.name === target ? 'geography-shape-highlight' : ''}`}
                    disabled={found || saving}
                    onClick={() => pick(region.name)}
                    data-state={region.name}
                    aria-label={showNames || found ? region.name : `State shape ${index + 1}`}
                  >
                    <svg viewBox={stateShapeViewBox(region.path)} aria-hidden="true" focusable="false">
                      <path d={region.path} />
                    </svg>
                    <span>{showNames || found ? region.name : `Shape ${index + 1}`}</span>
                  </button>
                ))}
              </div>
              {!showNames && !found && (
                <button type="button" className="btn" disabled={saving} onClick={() => setShowNames(true)}>
                  Show state names for help
                </button>
              )}
              <p className="stage-tip">Pick one big shape. Names and hints can help, too. There’s no timer.</p>
            </>
          ) : (
            <>
              <div className="geography-map">
                <svg
                  viewBox={mode === 'states' ? '0 0 850 490' : '0 0 720 360'}
                  role="group"
                  aria-label={mode === 'states' ? 'United States map, Alaska and Hawaii shown as insets' : 'World map of eleven introductory countries'}
                >
                  {regions.map((region, i) => (
                    <path
                      key={region.name}
                      d={region.path}
                      fill={(found || hint) && region.name === target ? '#ffd166' : ['#a8d8c0', '#b8d7ef', '#e7c5dd', '#e9dda9'][i % 4]}
                      stroke="#49645c"
                      strokeWidth={(found || hint) && region.name === target ? 3 : 0.7}
                      role="button"
                      tabIndex={found || saving ? -1 : 0}
                      aria-disabled={found || saving}
                      aria-describedby={hint && region.name === target ? 'geography-hint' : undefined}
                      aria-label={region.name}
                      onClick={() => pick(region.name)}
                      onKeyDown={(e) => {
                        if (!e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          pick(region.name);
                        }
                      }}
                    >
                      <title>{region.name}</title>
                    </path>
                  ))}
                </svg>
              </div>
              {mode === 'countries' && <p>Eleven introductory countries are shown. Small islands and boundaries are simplified.</p>}
              <p className="stage-tip">Scroll the map, or choose any place from the labeled list below.</p>
              <select aria-label="Pick a place on the map" value="" disabled={found || saving} onChange={(e) => pick(e.target.value)}>
                <option value="">Choose a place…</option>
                {regions.map((r) => (
                  <option key={r.name}>{r.name}</option>
                ))}
              </select>
            </>
          )}
          {hint && (
            <p id="geography-hint">
              Hint: {target} has a thick dark outline. {mode === 'shapes' ? 'Its name is shown, too.' : 'Find it in the list, too.'}
            </p>
          )}
          <Choices
            state={saving ? { next: 'disabled', hint: 'disabled', skip: 'disabled' } : undefined}
            items={
              found
                ? [{ id: 'next', label: round === 4 ? 'Finish exploring!' : 'Next place!', icon: '✨' }]
                : [
                    { id: 'hint', label: 'Show me a hint', icon: '🔎' },
                    { id: 'skip', label: 'Skip this place', icon: '↪' },
                  ]
            }
            onPick={(id) => {
              if (saveLock.current) return;
              if (id === 'skip') {
                pick('', true);
                return;
              }
              if (found) {
                responses.current = [];
                setRound(round + 1);
                setFound(false);
                setHint(false);
                setShowNames(false);
                setFeedback('');
              } else {
                setHint(true);
                if (mode === 'shapes') setShowNames(true);
                setFeedback(`Look for the golden shape. That’s ${target}!`);
              }
            }}
          />
          {!saving && (
            <button type="button" className="btn" onClick={() => setMode(null)}>
              Choose another level or map
            </button>
          )}
        </>
      )}
    </DialogueShell>
  );
}
