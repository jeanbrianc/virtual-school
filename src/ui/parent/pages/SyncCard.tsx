import { useEffect, useState } from 'react';
import { useServices } from '../../../app/services';
import type { SyncEngine, SyncView } from '../../../sync/engine';
import { Icon } from '../../shared/Icon';
import { Card } from '../components';

/** The live family-sync status. */
export function useSyncView(sync: SyncEngine): SyncView {
  const [view, setView] = useState<SyncView>(sync.current);
  useEffect(() => sync.subscribe(setView), [sync]);
  return view;
}

function ago(iso: string | undefined): string {
  if (!iso) return 'not yet';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function describeCloud(v: SyncView): string {
  const s = v.cloud?.summary;
  if (!s) return 'a saved school';
  const who = s.children.length ? s.children.join(' & ') : 'your family';
  return `${who}’s school · ${s.books} book${s.books === 1 ? '' : 's'} · saved ${new Date(s.savedAt).toLocaleDateString()}`;
}

/** Settings → Family sync: the same school on every device the family signs in on. */
export function SyncCard({ childName }: { childName: string }) {
  const { sync } = useServices();
  const v = useSyncView(sync);
  const [confirm, setConfirm] = useState<'use' | 'replace' | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000); // keep "2 min ago" fresh
    return () => clearInterval(t);
  }, []);

  const busy = v.phase === 'working' || v.phase === 'checking';
  const on = v.phase === 'on' || (v.phase === 'working' && !!v.joined) || (v.phase === 'error' && !!v.joined);

  return (
    <Card title="Family sync" icon="users">
      <div data-testid="sync-card">
        {v.phase === 'unavailable' ? (
          <p className="small">
            {v.cloud
              ? 'Family sync needs one more step on your AWS account: run npm run deploy:aws once (see docs/DEPLOY.md). Until then, the school lives in this browser only.'
              : 'Family sync works on your family website (lms.brianjeanbuilds.com): every device you sign in on shares the same school. Here, the school lives in this browser only.'}
          </p>
        ) : v.phase === 'checking' ? (
          <p className="small">Checking your family account…</p>
        ) : v.phase === 'needs-choice' && confirm === null ? (
          <>
            <p className="small">
              <strong>Your family account already has {describeCloud(v)}.</strong> This device has records of its own too. Which school should this device use?
            </p>
            <div className="row-actions">
              <button type="button" className="btn btn-primary btn-small" onClick={() => setConfirm('use')} data-testid="sync-use-family">
                Use the family’s school here
              </button>
              <button type="button" className="btn btn-small" onClick={() => setConfirm('replace')} data-testid="sync-replace-family">
                Make this device’s school the family’s
              </button>
            </div>
          </>
        ) : confirm ? (
          <div className="confirm-row">
            <span className="small">
              {confirm === 'use'
                ? 'This device’s own records are replaced by the family’s school.'
                : 'The family’s saved school — on every device — is replaced by this device’s. Records only the family’s school has are deleted.'}
            </span>
            <button
              type="button"
              className={`btn btn-small ${confirm === 'replace' ? 'btn-danger' : 'btn-primary'}`}
              data-testid="sync-confirm"
              onClick={() => {
                const run = confirm === 'use' ? sync.useFamilySchool() : sync.replaceFamilySchool();
                setConfirm(null);
                void run;
              }}
            >
              {confirm === 'use' ? 'Use the family’s school' : 'Replace the family’s school'}
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        ) : on ? (
          <>
            <p className="small" data-testid="sync-status">
              {v.phase === 'error' ? '⚠️ ' : '✅ '}
              <strong>On.</strong> {childName}’s books, progress, photos and settings are the same on every device you sign in on.{' '}
              {v.phase === 'working' ? 'Syncing…' : `Last synced ${ago(v.lastSyncAt)}.`}
              {v.pending > 0 && v.phase !== 'working' ? ` ${v.pending} change${v.pending === 1 ? '' : 's'} waiting to send.` : ''}
            </p>
            {v.phase === 'error' && <p className="small warn">{v.error}</p>}
            {v.justAdopted && <p className="small good">This device loaded the family’s school.</p>}
            <div className="row-actions">
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => void sync.syncNow()} data-testid="sync-now">
                <Icon name="upload" size={14} /> Sync now
              </button>
              <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => void sync.turnOff()} data-testid="sync-off">
                Stop syncing on this device
              </button>
            </div>
          </>
        ) : v.phase === 'error' ? (
          <>
            <p className="small warn">{v.error}</p>
            <button type="button" className="btn btn-small" onClick={() => void sync.init()}>
              Try again
            </button>
          </>
        ) : (
          <>
            {v.joined ? (
              <p className="small">
                <strong>Paused on this device.</strong> Changes made here stay here until you turn it back on
                {v.pending > 0 ? ` (${v.pending} waiting)` : ''}.
              </p>
            ) : (
              <p className="small">
                <strong>Off.</strong> Right now {childName}’s school lives only in this browser, so your phone or another tablet starts empty. Turn this on{' '}
                <strong>on the device that has her history</strong>, and every device you sign in on will share it.
              </p>
            )}
            <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void sync.turnOn()} data-testid="sync-on">
              {v.joined ? 'Turn family sync back on' : 'Turn on family sync'}
            </button>
          </>
        )}
        <details className="small sync-details">
          <summary>Where it’s saved</summary>
          <p>
            In your own AWS account, behind the family sign-in: records (books, reading, progress, conversations, settings) in a DynamoDB table with
            point-in-time recovery, photos in a private, versioned S3 bucket. Nothing goes to anyone else. Changes reach your other devices within about a
            minute; if two devices change the same thing, the newest change wins. A new device takes the family’s school automatically the first time it opens.
          </p>
        </details>
      </div>
    </Card>
  );
}
