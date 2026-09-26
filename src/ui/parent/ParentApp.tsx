/**
 * Parent Studio — the homeschool recordkeeping and curriculum tool beneath
 * the game. Dense, fast, accessible HTML (no 3D except the avatar preview).
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { useHousehold, useLiveQuery, useServices } from '../../app/services';
import type { Avatar, Child, Household } from '../../domain/types';
import { getAvatar, listChildren } from '../../services/householdService';
import { loadChildRecords, type ChildRecords } from '../../services/learningCore';
import { appStore } from '../../state/appState';
import { createStore, useStore } from '../../state/store';
import { ParentGate } from '../child/Overlays';
import { AvatarPortrait } from '../shared/AvatarPortrait';
import { Icon, type IconName } from '../shared/Icon';
import { TodayPage } from './pages/TodayPage';

const LogActivityPage = lazy(() => import('./pages/LogActivityPage').then((m) => ({ default: m.LogActivityPage })));
const BooksPage = lazy(() => import('./pages/BooksPage').then((m) => ({ default: m.BooksPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const CurriculumPage = lazy(() => import('./pages/CurriculumPage').then((m) => ({ default: m.CurriculumPage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ConversationsPage = lazy(() => import('./pages/ConversationsPage').then((m) => ({ default: m.ConversationsPage })));
const FamilyPage = lazy(() => import('./pages/FamilyPage').then((m) => ({ default: m.FamilyPage })));
const AvatarPage = lazy(() => import('./pages/AvatarPage').then((m) => ({ default: m.AvatarPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

export interface ParentData {
  household: Household;
  child: Child;
  children: Child[];
  avatar: Avatar | undefined;
  records: ChildRecords;
}

/** Which child the parent is looking at (persisted for the tab session). */
export const parentStore = createStore<{ childId: string | null }>({ childId: readSession('parentChildId') });

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode) — fine, it's a convenience.
  }
}

const UNLOCK_KEY = 'parentUnlockedUntil';
function isUnlocked(): boolean {
  if (appStore.get().parentUnlocked) return true;
  const until = Number(readSession(UNLOCK_KEY) ?? 0);
  return until > Date.now();
}

const NAV: { id: string; label: string; icon: IconName; group?: string }[] = [
  { id: 'today', label: 'Today', icon: 'calendar' },
  { id: 'log', label: 'Log a moment', icon: 'pencil' },
  { id: 'books', label: 'Books', icon: 'book' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'curriculum', label: 'Curriculum', icon: 'list' },
  { id: 'portfolio', label: 'Portfolio', icon: 'photo' },
  { id: 'reports', label: 'Reports', icon: 'report' },
  { id: 'conversations', label: 'Teacher talk', icon: 'eye' },
  { id: 'family', label: 'Family', icon: 'users', group: 'Household' },
  { id: 'avatar', label: 'Avatar', icon: 'user', group: 'Household' },
  { id: 'settings', label: 'Settings & privacy', icon: 'settings', group: 'Household' },
];

export function ParentApp({ section, param }: { section: string; param?: string }) {
  const services = useServices();
  const { ctx } = services;
  const household = useHousehold();
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = useStore(parentStore, (s) => s.childId);

  useEffect(() => {
    if (unlocked) writeSession(UNLOCK_KEY, String(Date.now() + 30 * 60_000));
  }, [unlocked]);
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo?.(0, 0);
  }, [section]);

  const data = useLiveQuery<ParentData | null>(async () => {
    const [h, kids] = await Promise.all([ctx.repos.households.all().then((x) => x[0]), listChildren(ctx)]);
    if (!h || kids.length === 0) return null;
    const child = kids.find((k) => k.id === selected) ?? kids.find((k) => k.status === 'active') ?? kids[0];
    if (!child) return null;
    const [records, avatar] = await Promise.all([loadChildRecords(ctx, child.id), getAvatar(ctx, child.id)]);
    return { household: h, child, children: kids, avatar, records };
  }, [selected]);

  if (!unlocked) {
    return (
      <div className="parent-locked">
        {household && (
          <ParentGate
            pin={household.settings.parentPin}
            showHint={household.settings.demoTools}
            onPass={() => {
              appStore.set({ parentUnlocked: true });
              setUnlocked(true);
            }}
            onClose={() => navigate({ name: 'home' })}
          />
        )}
      </div>
    );
  }

  const groups = NAV.reduce<Record<string, typeof NAV>>((acc, n) => {
    const g = n.group ?? 'Learning';
    (acc[g] ??= []).push(n);
    return acc;
  }, {});

  let page: ReactNode = <div className="p-loading">Loading…</div>;
  if (data) {
    const props = { data, ...(param ? { param } : {}) };
    switch (section) {
      case 'log':
        page = <LogActivityPage {...props} />;
        break;
      case 'books':
        page = <BooksPage {...props} />;
        break;
      case 'progress':
        page = <ProgressPage {...props} />;
        break;
      case 'curriculum':
        page = <CurriculumPage {...props} />;
        break;
      case 'portfolio':
        page = <PortfolioPage {...props} />;
        break;
      case 'reports':
        page = <ReportsPage {...props} />;
        break;
      case 'conversations':
        page = <ConversationsPage {...props} />;
        break;
      case 'family':
        page = <FamilyPage {...props} />;
        break;
      case 'avatar':
        page = <AvatarPage {...props} />;
        break;
      case 'settings':
        page = <SettingsPage {...props} />;
        break;
      default:
        page = <TodayPage {...props} />;
    }
  }

  return (
    <div className="parent">
      <aside className={`p-side ${menuOpen ? 'open' : ''}`}>
        <div className="p-brand">
          <span className="p-brand-mark">
            <Icon name="sparkle" size={20} />
          </span>
          <div>
            <strong>Parent Studio</strong>
            <span>{household?.name ?? 'Our Family School'}</span>
          </div>
        </div>
        {data && (
          <div className="child-switch">
            <AvatarPortrait avatar={data.avatar} size={40} />
            <label className="sr-only" htmlFor="child-select">
              Viewing learner
            </label>
            <select
              id="child-select"
              value={data.child.id}
              onChange={(e) => {
                parentStore.set({ childId: e.target.value });
                writeSession('parentChildId', e.target.value);
              }}
            >
              {data.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === 'inactive' ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <nav aria-label="Parent sections">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="p-nav-group">
              <div className="p-nav-label">{group}</div>
              {items.map((n) => (
                <a
                  key={n.id}
                  href={`#/parent/${n.id}`}
                  className={`p-nav-item ${section === n.id || (section === 'today' && n.id === 'today') ? 'active' : ''}`}
                  aria-current={section === n.id ? 'page' : undefined}
                  data-testid={`nav-${n.id}`}
                >
                  <Icon name={n.icon} size={18} />
                  {n.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="p-side-foot">
          {data && (
            <button
              type="button"
              className="btn btn-block"
              onClick={() => navigate({ name: 'school', childId: data.child.id })}
              disabled={data.child.status !== 'active'}
            >
              <Icon name="play" size={16} /> Back to {data.child.name}’s school
            </button>
          )}
          <button
            type="button"
            className="btn btn-block btn-ghost"
            onClick={() => {
              appStore.set({ parentUnlocked: false });
              writeSession(UNLOCK_KEY, null);
              navigate({ name: 'home' });
            }}
          >
            <Icon name="lock" size={16} /> Lock & exit
          </button>
        </div>
      </aside>
      <div className="p-main">
        <div className="p-topbar">
          <button type="button" className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <Icon name="list" />
          </button>
          <strong>Parent Studio</strong>
        </div>
        {data?.child.isDemo && (
          <div className="demo-banner" role="note">
            <Icon name="info" size={16} /> Showing <strong>sample demo data</strong> — illustrative history, not a real assessment. Reset or clear it anytime in
            Settings.
          </div>
        )}
        <Suspense fallback={<div className="p-loading">Loading…</div>}>{page}</Suspense>
      </div>
    </div>
  );
}
