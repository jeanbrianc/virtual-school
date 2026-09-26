/** "Who's learning today?" — the welcoming front door of the app. */
import { useState } from 'react';
import { navigate } from '../../app/router';
import { useHousehold, useLiveQuery, useServices } from '../../app/services';
import type { Avatar, Child } from '../../domain/types';
import { listChildren } from '../../services/householdService';
import { appStore } from '../../state/appState';
import { AvatarPortrait } from '../shared/AvatarPortrait';
import { Icon } from '../shared/Icon';
import { ParentGate } from '../child/Overlays';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning!';
  if (h < 17) return 'Good afternoon!';
  return 'Good evening!';
}

export function HomeScreen() {
  const services = useServices();
  const { ctx } = services;
  const household = useHousehold();
  const kids = useLiveQuery(
    async () => {
      const children = await listChildren(ctx);
      const avatars = await Promise.all(children.map((c) => ctx.repos.forChild(ctx.repos.avatars, c.id)));
      return children.map((c, i) => ({ child: c, avatar: avatars[i]?.[0] }));
    },
    [],
    ['children', 'avatars'],
  );
  const [gate, setGate] = useState(false);

  const enter = (child: Child) => {
    services.audio.unlock();
    appStore.set({ preview: null });
    navigate({ name: 'school', childId: child.id });
  };

  const active = (kids ?? []).filter((k) => k.child.status === 'active');
  const inactive = (kids ?? []).filter((k) => k.child.status !== 'active');

  return (
    <main className="home">
      <div className="home-sky" aria-hidden="true">
        <div className="cloud c1" />
        <div className="cloud c2" />
        <div className="cloud c3" />
        <svg className="home-hills" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0 210 C 240 150 420 250 720 200 S 1200 140 1440 190 V320 H0Z" fill="#a9c98d" />
          <path d="M0 250 C 300 200 520 290 860 240 S 1260 220 1440 250 V320 H0Z" fill="#8db873" />
        </svg>
        <svg className="home-school" viewBox="0 0 240 180">
          <rect x="30" y="70" width="180" height="100" rx="6" fill="#f3e6cf" />
          <path d="M20 76 120 16l100 60z" fill="#d9774b" />
          <rect x="104" y="108" width="32" height="62" rx="4" fill="#9fb59a" />
          <rect x="52" y="96" width="34" height="30" rx="3" fill="#cfe8ea" stroke="#fff" strokeWidth="4" />
          <rect x="154" y="96" width="34" height="30" rx="3" fill="#cfe8ea" stroke="#fff" strokeWidth="4" />
          <circle cx="120" cy="56" r="12" fill="#ffd166" />
          <rect x="118" y="0" width="4" height="22" fill="#7a5236" />
          <path d="M122 2h22l-6 6 6 6h-22z" fill="#e3b448" />
        </svg>
      </div>

      <section className="home-panel">
        <p className="home-kicker">{household?.name ?? 'Our Family School'}</p>
        <h1 className="home-title">{greeting()} Who’s learning today?</h1>
        <div className="profile-row">
          {active.map(({ child, avatar }) => (
            <ProfileCard key={child.id} child={child} avatar={avatar} onEnter={() => enter(child)} />
          ))}
          {inactive.map(({ child, avatar }) => (
            <div key={child.id} className="profile-card profile-soon" aria-label={`${child.name} — coming soon`}>
              <AvatarPortrait avatar={avatar} size={120} />
              <span className="profile-name">{child.name}</span>
              <span className="profile-note">Coming soon — ask a grown-up</span>
            </div>
          ))}
        </div>
        <div className="home-actions">
          {active[0] && (
            <button type="button" className="btn home-btn" onClick={() => navigate({ name: 'museum', childId: active[0]!.child.id, tour: false })}>
              <Icon name="museum" /> Learning Museum
            </button>
          )}
          <button type="button" className="btn home-btn" onClick={() => setGate(true)} data-testid="home-grownups">
            <Icon name="lock" /> Grown-ups
          </button>
        </div>
        {!services.persistent && (
          <p className="home-warning" role="alert">
            This browser isn’t letting the app save progress (private mode?). Everything will reset when you close the tab.
          </p>
        )}
      </section>
      {gate && household && (
        <ParentGate
          pin={household.settings.parentPin}
          showHint={household.settings.demoTools}
          onPass={() => {
            appStore.set({ parentUnlocked: true });
            navigate({ name: 'parent', section: 'today' });
          }}
          onClose={() => setGate(false)}
        />
      )}
    </main>
  );
}

function ProfileCard({ child, avatar, onEnter }: { child: Child; avatar: Avatar | undefined; onEnter: () => void }) {
  return (
    <button type="button" className="profile-card" onClick={onEnter} data-testid={`enter-${child.name.toLowerCase()}`}>
      <span className="profile-halo" style={{ background: avatar?.outfitColor ?? '#e3b448' }} />
      <AvatarPortrait avatar={avatar} size={150} />
      <span className="profile-name">{child.name}</span>
      <span className="profile-go">
        Enter my school <Icon name="arrowRight" />
      </span>
    </button>
  );
}
