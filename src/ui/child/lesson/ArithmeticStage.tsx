import { BaseTenStage } from './BaseTenStage';

/** Original countable bundle drawings. These are representations, not observed manipulation. */
export function ArithmeticStage({
  left,
  right,
  operation,
  showResult = false,
}: {
  left: number;
  right: number;
  operation: 'add' | 'subtract';
  showResult?: boolean;
}) {
  const result = operation === 'add' ? left + right : left - right;
  return (
    <div className="arithmetic-stage" data-testid="arithmetic-stage">
      <p className="arithmetic-equation" aria-label={`${left} ${operation === 'add' ? 'plus' : 'minus'} ${right} equals ${showResult ? result : 'how many'}`}>
        {left} {operation === 'add' ? '+' : '−'} {right} = {showResult ? result : '?'}
      </p>
      <div className="arithmetic-operands">
        <section aria-label={`Start with ${left}`}>
          <h3>Start with {left}</h3>
          <BaseTenStage tens={Math.floor(left / 10)} ones={left % 10} numeral={null} />
        </section>
        <section aria-label={`${operation === 'add' ? 'Join' : 'Take away'} ${right}`}>
          <h3>
            {operation === 'add' ? 'Join' : 'Take away'} {right}
          </h3>
          <BaseTenStage tens={Math.floor(right / 10)} ones={right % 10} numeral={null} />
        </section>
      </div>
      {showResult && (
        <p className="arithmetic-result">
          {operation === 'add' ? 'Altogether' : 'Remaining'}: {Math.floor(result / 10)} tens and {result % 10} ones make {result}.
        </p>
      )}
    </div>
  );
}
