/**
 * Parent Studio: what each number on the classroom rug does. Match the moves
 * — and her own names for them — to her dance and gymnastics classes, and
 * preview any move on the avatar above.
 */
import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../../../app/services';
import {
  DANCE_MOVES,
  DANCE_MOVE_IDS,
  DEFAULT_CIRCUIT,
  circuitFor,
  cleanStationName,
  stationLabel,
  type CircuitStation,
  type DanceMoveId,
} from '../../../domain/play/circuit';
import type { Child } from '../../../domain/types';
import { updateChild } from '../../../services/householdService';
import { Icon } from '../../shared/Icon';
import { Card } from '../components';

const DANCE = DANCE_MOVE_IDS.filter((id) => DANCE_MOVES[id].kind === 'dance');
const GYM = DANCE_MOVE_IDS.filter((id) => DANCE_MOVES[id].kind === 'gym');

const defaults = (): CircuitStation[] => DEFAULT_CIRCUIT.map((move) => ({ move }));

/** A station as stored: tidy name, or no name at all. */
function tidy(s: CircuitStation): CircuitStation {
  const name = s.name ? cleanStationName(s.name) : '';
  return name ? { move: s.move, name } : { move: s.move };
}

export function CircuitCard({ child, onTry }: { child: Child; onTry?: (move: DanceMoveId) => void }) {
  const { ctx } = useServices();
  const saved = useMemo(() => circuitFor(child), [child]);
  const [draft, setDraft] = useState<CircuitStation[]>(saved);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setDraft(circuitFor(child));
    setJustSaved(false);
    // Only when switching children: a save updates `child` too, and the draft already matches it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.id]);

  const clean = draft.map(tidy);
  const dirty = JSON.stringify(clean) !== JSON.stringify(saved);
  const isDefault = clean.every((s, i) => s.move === DEFAULT_CIRCUIT[i] && !s.name);
  const done = child.circuitsDone ?? 0;

  const setStation = (i: number, patch: Partial<CircuitStation>) => {
    setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setJustSaved(false);
  };

  const save = async () => {
    const { circuit: _old, ...rest } = child;
    await updateChild(ctx, isDefault ? rest : { ...rest, circuit: clean });
    setDraft(clean);
    setJustSaved(true);
  };

  return (
    <Card title="Dance & gym circuit" icon="star" className="circuit-card">
      <p className="muted small">
        The numbers 1–10 on the classroom rug are stations, like at her dance and gymnastics classes. Hopping onto a number makes {child.name} do its move;
        going 1 → 10 in order finishes the whole circuit.
        {done > 0 && (
          <strong data-testid="circuits-done">
            {' '}
            She’s finished it {done} {done === 1 ? 'time' : 'times'}!
          </strong>
        )}
      </p>
      <ol className="circuit-list">
        {draft.map((s, i) => (
          <li key={i} className="circuit-row">
            <span className="circuit-num" aria-hidden="true">
              {i + 1}
            </span>
            <select
              value={s.move}
              onChange={(e) => setStation(i, { move: e.target.value as DanceMoveId })}
              aria-label={`Number ${i + 1}: move`}
              title={DANCE_MOVES[s.move].cue}
              data-testid={`circuit-move-${i + 1}`}
            >
              <optgroup label="Dance">
                {DANCE.map((id) => (
                  <option key={id} value={id}>
                    {DANCE_MOVES[id].emoji} {DANCE_MOVES[id].name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Gymnastics">
                {GYM.map((id) => (
                  <option key={id} value={id}>
                    {DANCE_MOVES[id].emoji} {DANCE_MOVES[id].name}
                  </option>
                ))}
              </optgroup>
            </select>
            <input
              type="text"
              className="circuit-name"
              value={s.name ?? ''}
              maxLength={30}
              placeholder={`${child.name} calls it…`}
              onChange={(e) => setStation(i, { name: e.target.value })}
              aria-label={`Number ${i + 1}: what ${child.name} calls it (optional)`}
              data-testid={`circuit-name-${i + 1}`}
            />
            {onTry && (
              <button
                type="button"
                className="btn btn-small btn-ghost circuit-try"
                onClick={() => onTry(s.move)}
                aria-label={`Preview number ${i + 1}, ${stationLabel(tidy(s))}`}
                data-testid={`circuit-try-${i + 1}`}
              >
                ▶ Try
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="circuit-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setDraft(defaults());
            setJustSaved(false);
          }}
          disabled={isDefault}
        >
          Reset to the usual moves
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!dirty} data-testid="circuit-save">
          <Icon name="check" size={16} /> {justSaved && !dirty ? 'Saved' : 'Save circuit'}
        </button>
      </div>
    </Card>
  );
}
