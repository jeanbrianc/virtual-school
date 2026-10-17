/** Countable groups, not tiny hit targets. Aggregate labels are reserved for teaching and support. */
export function BaseTenStage({ tens, ones, numeral, revealLabels = false }: { tens: number; ones: number; numeral: number | null; revealLabels?: boolean }) {
  return (
    <div className="base-ten-stage" data-testid="base-ten-stage">
      {numeral !== null && (
        <strong className="base-ten-number" aria-label={`Number ${numeral}`}>
          {numeral}
        </strong>
      )}
      <div className="base-ten-parts">
        <section aria-label={revealLabels ? `${tens} tens, worth ${tens * 10}` : 'Bundles of ten'}>
          <h3>{revealLabels ? `${tens} tens` : 'Tens'}</h3>
          <div className="base-ten-bundles">
            {Array.from({ length: tens }, (_, i) => (
              <span className="base-ten-bundle" role="img" aria-label="One bundle of ten" key={i}>
                10
              </span>
            ))}
          </div>
          <p>Each bundle is 10.</p>
        </section>
        <section aria-label={revealLabels ? `${ones} extra ones` : 'Loose units'}>
          <h3>{revealLabels ? `${ones} ones` : 'Ones'}</h3>
          <div className="base-ten-ones">
            {Array.from({ length: ones }, (_, i) => (
              <span className="base-ten-one" role="img" aria-label="One loose unit" key={i}>
                1
              </span>
            ))}
            {ones === 0 && revealLabels && <span>No extra ones</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
