import { WEATHER_LABELS, type WeatherPicture as Picture } from '../../../domain/lessons/weather';

/** Original schematic symbols. Shapes, not color alone, distinguish the details. */
export function WeatherPicture({ picture }: { picture: Picture }) {
  return (
    <svg className="weather-picture" viewBox="0 0 160 120" role="img" aria-label={WEATHER_LABELS[picture]}>
      <rect x="2" y="2" width="156" height="116" rx="18" fill="#edf6ff" />
      {picture === 'sun' ? (
        <g fill="#f4cd53" stroke="#95601b" strokeWidth="3">
          <circle cx="80" cy="58" r="24" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <path key={a} d="M80 17V7" transform={`rotate(${a} 80 58)`} strokeWidth="5" strokeLinecap="round" />
          ))}
        </g>
      ) : (
        <>
          <path d="M36 66C9 66 16 35 39 37C43 9 82 10 91 32C119 13 143 37 131 52C151 65 124 76 109 68H36Z" fill="#d5e1eb" stroke="#526e88" strokeWidth="3" />
          {picture === 'rain' &&
            [44, 80, 116].map((x) => (
              <path key={x} d={`M${x} 80Q${x - 15} 100 ${x} 105Q${x + 15} 100 ${x} 80Z`} fill="#3c84c1" stroke="#234e7c" strokeWidth="2" />
            ))}
          {picture === 'snow' &&
            [44, 80, 116].map((x) => (
              <g key={x} stroke="#376c9c" strokeWidth="3" strokeLinecap="round">
                <path d={`M${x} 82V106M${x - 10} 88L${x + 10} 100M${x - 10} 100L${x + 10} 88`} />
              </g>
            ))}
        </>
      )}
    </svg>
  );
}
export function WeatherStage({ pictures, chart, modelAnswer }: { pictures: readonly Picture[]; chart: boolean; modelAnswer?: string }) {
  return (
    <section
      className={`weather-stage ${chart ? 'weather-chart' : ''}`}
      aria-label={chart ? 'Made-up weather picture chart' : 'Made-up sky picture'}
      data-pictures={pictures.join(',')}
    >
      <p>{chart ? 'Made-up chart · one picture per day · not a forecast' : 'A made-up sky picture'}</p>
      <ol>
        {pictures.map((picture, i) => (
          <li key={i} className={modelAnswer === picture ? 'weather-counted' : ''}>
            {chart && <span>Day {i + 1}</span>}
            <WeatherPicture picture={picture} />
            <span>{WEATHER_LABELS[picture]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
