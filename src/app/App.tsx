import { lazy, Suspense, useEffect } from 'react';
import { ErrorBoundary } from '../ui/shared/ErrorBoundary';
import { HomeScreen } from '../ui/home/HomeScreen';
import { useRoute } from './router';

const ChildMode = lazy(() => import('../ui/child/ChildMode').then((m) => ({ default: m.ChildMode })));
const ParentApp = lazy(() => import('../ui/parent/ParentApp').then((m) => ({ default: m.ParentApp })));
const Showcase = lazy(() => import('../ui/showcase/Showcase').then((m) => ({ default: m.Showcase })));

export function App() {
  const route = useRoute();

  useEffect(() => {
    document.body.dataset.mode = route.name;
  }, [route.name]);

  return (
    <ErrorBoundary key={route.name}>
      <Suspense fallback={<div className="boot">Loading…</div>}>
        {route.name === 'home' && <HomeScreen />}
        {route.name === 'school' && <ChildMode childId={route.childId} />}
        {route.name === 'parent' && <ParentApp section={route.section} {...(route.param ? { param: route.param } : {})} />}
        {route.name === 'museum' && <Showcase childId={route.childId} tour={route.tour} />}
      </Suspense>
    </ErrorBoundary>
  );
}
