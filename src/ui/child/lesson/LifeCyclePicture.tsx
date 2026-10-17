import { LIFE_CYCLES, LIFE_STAGE_LABELS, type LifeCycle, type LifeStage } from '../../../domain/lessons/lifeCycle';

/** Original schematic vector drawings; no external images, fonts or services. */
export function LifeCyclePicture({ stage }: { stage: LifeStage }) {
  return (
    <svg className="life-picture" viewBox="0 0 180 145" role="img" aria-label={LIFE_STAGE_LABELS[stage]}>
      <rect x="2" y="2" width="176" height="141" rx="22" fill="#f3f8e9" />
      {['seed', 'seedling', 'flower', 'fruit'].includes(stage) && <path d="M15 119 Q90 106 165 119 L165 133 L15 133Z" fill="#a77a51" />}
      {stage === 'seed' && (
        <>
          <ellipse cx="90" cy="91" rx="23" ry="31" transform="rotate(28 90 91)" fill="#b76b32" stroke="#603c23" strokeWidth="4" />
          <path d="M90 68Q75 91 87 112" fill="none" stroke="#f5d7ab" strokeWidth="5" />
        </>
      )}
      {(stage === 'seedling' || stage === 'flower' || stage === 'fruit') && (
        <>
          <path d={`M90 117 Q87 91 90 ${stage === 'seedling' ? '64' : '44'}`} fill="none" stroke="#3b7037" strokeWidth="7" strokeLinecap="round" />
          <path d="M88 97Q48 100 48 72Q79 68 88 97Z M91 80Q126 81 134 57Q105 53 91 80Z" fill="#73a84f" stroke="#3b7037" strokeWidth="3" />
          <path d="M90 119L83 130M90 119L100 132" stroke="#e4c68c" strokeWidth="3" />
        </>
      )}
      {stage === 'flower' && (
        <>
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse key={angle} cx="90" cy="26" rx="12" ry="20" transform={`rotate(${angle} 90 44)`} fill="#f1c947" stroke="#9b6826" strokeWidth="2" />
          ))}
          <circle cx="90" cy="44" r="11" fill="#ae6c2e" />
        </>
      )}
      {stage === 'fruit' && (
        <>
          <circle cx="89" cy="53" r="29" fill="#dc6049" stroke="#913c2b" strokeWidth="3" />
          <path d="M88 27L78 19L86 33L101 26L94 23" fill="#3b7037" />
          <path d="M91 33Q119 54 91 77Z" fill="#ffe3a5" stroke="#913c2b" strokeWidth="2" />
          {[43, 54, 65].map((y) => (
            <ellipse key={y} cx="99" cy={y} rx="3" ry="4" fill="#8a542f" />
          ))}
        </>
      )}
      {(stage === 'egg' || stage === 'caterpillar') && (
        <>
          <path d="M26 112Q21 53 145 65Q140 128 26 112Z" fill="#77aa57" stroke="#3b7037" strokeWidth="3" />
          <path d="M28 111L143 66" stroke="#426e3b" strokeWidth="3" />
        </>
      )}
      {stage === 'egg' && (
        <>
          <ellipse cx="88" cy="76" rx="16" ry="23" fill="#fff1c3" stroke="#8f7941" strokeWidth="3" />
          <path d="M83 57L82 92M91 55L95 92" stroke="#d3bb80" strokeWidth="2" />
        </>
      )}
      {stage === 'caterpillar' && (
        <>
          {[48, 66, 84, 102, 120].map((x, i) => (
            <g key={x}>
              <path d={`M${x - 4} 88L${x - 7} 99M${x + 3} 88L${x + 7} 97`} stroke="#355a35" strokeWidth="3" />
              <circle cx={x} cy={81 - i * 2} r="13" fill="#b7ce5c" stroke="#416f36" strokeWidth="3" />
            </g>
          ))}
          <circle cx="123" cy="69" r="2.5" fill="#253c2b" />
        </>
      )}
      {stage === 'chrysalis' && (
        <>
          <path d="M24 25Q100 12 156 32" fill="none" stroke="#825a37" strokeWidth="9" strokeLinecap="round" />
          <path d="M91 21L91 40" stroke="#563f2c" strokeWidth="3" />
          <path d="M89 39Q117 57 110 92Q105 117 86 120Q65 98 73 74Q79 56 89 39Z" fill="#85b16b" stroke="#416b42" strokeWidth="3" />
          <path d="M77 70L109 87M75 84L104 99" fill="none" stroke="#ccdc9b" strokeWidth="3" />
        </>
      )}
      {stage === 'butterfly' && (
        <>
          <path
            d="M85 75C12 5 14 88 65 89C20 121 69 142 87 94 M95 75C168 5 166 88 115 89C160 121 111 142 93 94"
            fill="#e99c45"
            stroke="#573c39"
            strokeWidth="5"
          />
          <path d="M86 59Q90 52 94 59L95 105Q90 116 85 105Z" fill="#573c39" />
          <path d="M87 61Q80 38 72 40M93 61Q100 38 108 40" fill="none" stroke="#573c39" strokeWidth="3" />
          <circle cx="72" cy="40" r="3" fill="#573c39" />
          <circle cx="108" cy="40" r="3" fill="#573c39" />
          <circle cx="53" cy="64" r="9" fill="#fff1c3" />
          <circle cx="127" cy="64" r="9" fill="#fff1c3" />
        </>
      )}
    </svg>
  );
}

export function LifeCycleStage({ stage, next }: { stage: LifeStage; next: boolean }) {
  return (
    <div className="life-stage" data-stage={stage}>
      <figure>
        <LifeCyclePicture stage={stage} />
        <figcaption>{LIFE_STAGE_LABELS[stage]}</figcaption>
      </figure>
      {next && (
        <>
          <span aria-label="followed by" className="life-arrow">
            →
          </span>
          <div className="life-unknown" aria-label="Which stage next?">
            ?
          </div>
        </>
      )}
    </div>
  );
}

export function LifeCycleModel({ cycle }: { cycle: LifeCycle }) {
  return (
    <div className="life-model" aria-label="Worked life-cycle model">
      <ol>
        {LIFE_CYCLES[cycle].map((stage) => (
          <li key={stage}>
            <LifeCyclePicture stage={stage} />
            <span>{LIFE_STAGE_LABELS[stage]}</span>
          </li>
        ))}
      </ol>
      <p>
        {cycle === 'plant'
          ? 'Seeds from the fruit can start new plants. This is a simple flowering-plant model.'
          : 'Adult females can lay eggs for a new generation. The adult does not turn into an egg.'}
      </p>
    </div>
  );
}
