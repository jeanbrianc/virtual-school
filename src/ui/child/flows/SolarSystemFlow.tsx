import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getSolarSystemPlanet, SOLAR_SYSTEM_PLANETS } from '../../../domain/solarSystem';
import { Icon } from '../../shared/Icon';

/** A quiet, offline exploration: no quiz, timer, or learning record. */
export function SolarSystemFlow({ initialPlanetId, onClose }: { initialPlanetId?: string; onClose: () => void }) {
  const [planetId, setPlanetId] = useState(() => getSolarSystemPlanet(initialPlanetId).id);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const planet = getSolarSystemPlanet(planetId);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div
      className="solar-system-backdrop"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        if (event.key === 'Tab') {
          const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          const first = buttons?.[0];
          const last = buttons?.[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div ref={dialog} className="solar-system-panel" role="dialog" aria-modal="true" aria-labelledby="solar-system-title" data-testid="solar-system-explorer">
        <header className="solar-system-header">
          <div>
            <p className="solar-system-eyebrow">A little space adventure</p>
            <h2 id="solar-system-title">Explore our solar system</h2>
          </div>
          <button ref={closeButton} type="button" className="solar-system-close" onClick={onClose} aria-label="Close solar system">
            <Icon name="close" size={24} />
          </button>
        </header>
        <p className="solar-system-intro">Choose a planet. What will you discover?</p>
        <div className="solar-system-planets" role="group" aria-label="Planets in order from the Sun">
          {SOLAR_SYSTEM_PLANETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="solar-system-planet-button"
              aria-pressed={planet.id === item.id}
              onClick={() => setPlanetId(item.id)}
              data-planet-id={item.id}
            >
              <span className={`solar-system-orb solar-system-orb-${item.id}`} style={{ '--planet-color': item.color } as CSSProperties} aria-hidden="true" />
              <span>{item.name}</span>
              <small>{item.orderFromSun} from the Sun</small>
            </button>
          ))}
        </div>
        <section
          className="solar-system-facts"
          aria-live="polite"
          aria-atomic="true"
          aria-labelledby="solar-system-planet-name"
          data-testid="solar-system-facts"
        >
          <div className="solar-system-portrait" aria-hidden="true">
            <span className={`solar-system-orb solar-system-orb-${planet.id}`} style={{ '--planet-color': planet.color } as CSSProperties} />
          </div>
          <div>
            <p className="solar-system-eyebrow">
              Planet {planet.orderFromSun} · {planet.kind}
            </p>
            <h3 id="solar-system-planet-name">{planet.name}</h3>
            <p className="solar-system-tagline">{planet.tagline}</p>
            <ul>
              {planet.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </section>
        <p className="solar-system-note">The Sun is a star. All eight planets travel around it! Pictures are not to scale.</p>
      </div>
    </div>
  );
}
