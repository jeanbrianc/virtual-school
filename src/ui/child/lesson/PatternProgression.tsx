import { PATTERN_RULES, PATTERN_UNITS, patternProgressionLesson } from '../../../domain/lessons/patternProgression';
import { SHAPES, type Shape } from '../../../domain/lessons/patterns';
import type { Problem } from '../../../domain/lessons/types';
import { ShapePicture } from './ShapePicture';

export function PatternLevelChoices({ onStart }: { onStart: (tier: number) => void }) {
  return (
    <div className="pattern-levels" role="group" aria-label="Choose matching or an optional pattern challenge">
      {patternProgressionLesson.tiers.map((tier, index) => (
        <button type="button" className="pattern-level" data-testid={`pattern-level-${index}`} key={tier.skillId} onClick={() => onStart(index)}>
          <span className="pattern-level-pictures" aria-hidden="true">
            {PATTERN_UNITS[PATTERN_RULES[index]!].map((shape, i) => (
              <ShapePicture key={i} shape={SHAPES[shape]!} />
            ))}
          </span>
          <span>{tier.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PatternProgressionStage({ shapes, unitLength, matching }: { shapes: readonly Shape[]; unitLength: number; matching: boolean }) {
  const groups = Array.from({ length: Math.ceil((shapes.length + (matching ? 0 : 1)) / unitLength) }, (_, i) =>
    shapes.slice(i * unitLength, (i + 1) * unitLength),
  );
  return (
    <div
      className="pattern-playground-stage"
      aria-label={matching ? 'Shape to match' : `Pattern to continue: ${shapes.join(', ')}, next shape?`}
      data-matching={matching}
      data-unit-length={unitLength}
    >
      {groups.map((group, i) => (
        <div className="pattern-little-group" key={i}>
          {group.map((shape, j) => (
            <div className="pattern-token" data-shape={shape} key={j}>
              <ShapePicture shape={shape} />
            </div>
          ))}
          {!matching && i === groups.length - 1 && (
            <span className="pattern-token pattern-gap" aria-label="Next shape">
              ?
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function PatternProgressionChoices({
  problem,
  busy,
  state,
  answer,
}: {
  problem: Problem;
  busy: boolean;
  state: Record<string, string>;
  answer: (id: string) => void;
}) {
  return (
    <div className="pattern-playground-choices" aria-label="Shape choices">
      {problem.choices.map((choice) => (
        <button
          type="button"
          key={choice.id}
          data-testid={`choice-${choice.id}`}
          aria-label={`Choose ${choice.label}`}
          disabled={busy || state[choice.id] === 'disabled'}
          className={`pattern-playground-choice ${state[choice.id] === 'right' ? 'pattern-selected' : state[choice.id] === 'soft' ? 'pattern-supported' : ''}`}
          onClick={() => answer(choice.id)}
        >
          {choice.shapes?.map((shape, i) => (
            <ShapePicture key={i} shape={shape} />
          ))}
          <span>{choice.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PatternWorkedModel({ problem }: { problem: Problem }) {
  if (problem.visual.type !== 'pattern-progression') return null;
  const unit = problem.visual.shapes.slice(0, problem.visual.unitLength);
  return (
    <div className="pattern-worked-model" role="group" aria-label="Worked shape pattern model">
      <p>{problem.visual.matching ? 'Match the outline.' : 'This little group repeats.'}</p>
      <div className="pattern-little-group">
        {unit.map((shape, i) => (
          <ShapePicture shape={shape} key={i} />
        ))}
      </div>
      <p>{problem.model}</p>
    </div>
  );
}
