import { useSyncExternalStore } from 'react';

/**
 * Minimal hash router. Routes:
 *   #/                          home (profile picker)
 *   #/school/:childId           child mode (3D school)
 *   #/museum/:childId           family showcase
 *   #/parent/:section?          parent studio
 */
export type Route =
  | { name: 'home' }
  | { name: 'school'; childId: string }
  | { name: 'museum'; childId: string; tour: boolean }
  | { name: 'parent'; section: string; param?: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '');
  const [head, a, b] = path.split('/').map((p) => decodeURIComponent(p));
  if (head === 'school' && a) return { name: 'school', childId: a };
  if (head === 'museum' && a) return { name: 'museum', childId: a, tour: b === 'tour' };
  if (head === 'parent') return { name: 'parent', section: a || 'today', ...(b ? { param: b } : {}) };
  return { name: 'home' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'school':
      return `#/school/${encodeURIComponent(route.childId)}`;
    case 'museum':
      return `#/museum/${encodeURIComponent(route.childId)}${route.tour ? '/tour' : ''}`;
    case 'parent':
      return `#/parent/${route.section}${route.param ? `/${encodeURIComponent(route.param)}` : ''}`;
    default:
      return '#/';
  }
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  return parseHash(hash);
}

export function navigate(route: Route, replace = false): void {
  const hash = routeToHash(route);
  if (replace) window.history.replaceState(null, '', hash);
  else window.location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
