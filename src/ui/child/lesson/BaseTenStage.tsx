/** Bundles are visual groups, never 99 tiny hit targets. Text conveys every quantity. */
export function BaseTenStage({ tens, ones, numeral }: { tens: number; ones: number; numeral: number | null }) {
  return (
    <div className="base-ten-stage" data-testid="base-ten-stage">
      {numeral !== null && (
        <strong className="base-ten-number" aria-label={`Number ${numeral}`}>
          {numeral}
        </strong>
      )}
      <div className="base-ten-parts">
        <section aria-label={`${tens} tens, worth ${tens * 10}`}>
          <h3>{tens} tens</h3>
          <div className="base-ten-bundles" aria-hidden="true">
            {Array.from({ length: tens }, (_, i) => (
              <span className="base-ten-bundle" key={i}>
                10
              </span>
            ))}
          </div>
          <p>Each bundle is 10.</p>
        </section>
        <section aria-label={`${ones} extra ones`}>
          <h3>{ones} ones</h3>
          <div className="base-ten-ones" aria-hidden="true">
            {Array.from({ length: ones }, (_, i) => (
              <span className="base-ten-one" key={i}>
                1
              </span>
            ))}
            {ones === 0 && <span>No extra ones</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
