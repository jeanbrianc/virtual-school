import { useEffect, useState } from 'react';
import { navigate } from '../../../app/router';
import { useServices } from '../../../app/services';
import type { AudioSettings, GraphicsQuality, HouseholdSettings } from '../../../domain/types';
import { buildMilestonePreview, MILESTONE_PREVIEWS, type MilestonePreviewId } from '../../../domain/world/previews';
import { deleteChildData, exportChildData, updateSettings } from '../../../services/householdService';
import { snapshotFromRecords } from '../../../services/learningCore';
import { appStore } from '../../../state/appState';
import { shelfBooksFrom } from '../../child/useChildWorld';
import { Icon } from '../../shared/Icon';
import { Card, PageHeader } from '../components';
import type { ParentData } from '../ParentApp';

function Slider({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const id = `sl-${label.replace(/\s/g, '')}`;
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        disabled={disabled}
      />
      <span className="muted small num">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function SettingsPage({ data }: { data: ParentData }) {
  const services = useServices();
  const { ctx, audio, speechOut, speechIn, persistent } = services;
  const { household, child, records } = data;
  const s = household.settings;
  const [pin, setPin] = useState({ next: '', confirm: '' });
  const [endpoint, setEndpoint] = useState(s.interpretation.endpoint ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
  }, [records]);

  const patch = async (p: Partial<HouseholdSettings>, note?: string) => {
    const h = await updateSettings(ctx, p);
    if (p.audio) audio.setSettings(h.settings.audio);
    if (note) setMsg(note);
  };
  const setAudio = (a: Partial<AudioSettings>) => void patch({ audio: { ...s.audio, ...a } });

  const savePin = async () => {
    if (!/^\d{4}$/.test(pin.next)) return setMsg('The PIN must be exactly 4 digits.');
    if (pin.next !== pin.confirm) return setMsg('The two PINs don’t match.');
    await patch({ parentPin: pin.next }, 'Parent PIN updated.');
    setPin({ next: '', confirm: '' });
  };

  const preview = (id: MilestonePreviewId) => {
    const p = buildMilestonePreview(id, snapshotFromRecords(records), new Set(records.unlocks.map((u) => u.rewardId)), shelfBooksFrom(records.books));
    appStore.set({ preview: { label: p.label, world: p.world, books: p.books, celebrate: p.celebrate } });
    navigate({ name: 'school', childId: child.id });
  };

  const download = async () => {
    const json = await exportChildData(ctx, child.id);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${child.name.toLowerCase()}-learning-records-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const remoteOn = s.interpretation.provider === 'http' && s.interpretation.consentToSend && !!s.interpretation.endpoint;
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)} MB`;

  return (
    <div className="page">
      <PageHeader
        title="Settings & privacy"
        subtitle="You’re the administrator. Everything is stored on this device unless you explicitly turn something on below."
      />
      {msg && (
        <div className="notice success" role="status">
          <Icon name="info" size={16} /> {msg}
        </div>
      )}
      <div className="grid-2">
        <div className="stack">
          <Card title="Sound" icon="sound">
            <label className="check">
              <input type="checkbox" checked={s.audio.muted} onChange={(e) => setAudio({ muted: e.target.checked })} /> Mute everything
            </label>
            <Slider label="Master volume" value={s.audio.master} onChange={(v) => setAudio({ master: v })} disabled={s.audio.muted} />
            <Slider label="Sound effects" value={s.audio.effects} onChange={(v) => setAudio({ effects: v })} disabled={s.audio.muted} />
            <Slider label="Background ambience" value={s.audio.ambience} onChange={(v) => setAudio({ ambience: v })} disabled={s.audio.muted} />
            <Slider label="Teacher voices" value={s.audio.voice} onChange={(v) => setAudio({ voice: v })} disabled={s.audio.muted} />
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                audio.unlock();
                audio.play('chime');
              }}
            >
              <Icon name="speaker" size={14} /> Test sound
            </button>
            <p className="muted small">All sounds are synthesized in the browser — no music files or streaming.</p>
          </Card>

          <Card title="Voice" icon="mic">
            <label className="check">
              <input type="checkbox" checked={s.readAloud} disabled={!speechOut.available} onChange={(e) => void patch({ readAloud: e.target.checked })} />{' '}
              Teachers read their lines aloud automatically
            </label>
            <p className="muted small">
              {speechOut.available
                ? 'Uses your device’s built-in text-to-speech voices. A speaker button is always available for any line.'
                : 'This browser has no built-in speech voices; text and pictures are always shown.'}
            </p>
            <label className="check">
              <input type="checkbox" checked={s.speechInput} disabled={!speechIn.available} onChange={(e) => void patch({ speechInput: e.target.checked })} />{' '}
              Let {child.name} answer some questions by talking
            </label>
            <p className="muted small">
              {speechIn.available
                ? '⚠️ Browser speech recognition may send audio to the browser maker’s servers (e.g. Google for Chrome). Off by default; tapping answers always works.'
                : 'Speech recognition isn’t available in this browser. Tapping answers always works.'}
            </p>
          </Card>

          <Card title="Graphics" icon="eye">
            <label htmlFor="gq">3D quality</label>
            <select
              id="gq"
              value={s.graphicsQuality}
              onChange={(e) => void patch({ graphicsQuality: e.target.value as GraphicsQuality }, 'Graphics quality applies next time the school opens.')}
            >
              <option value="high">High — soft shadows & glow</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low — older tablets & laptops</option>
            </select>
          </Card>

          <Card title="Parent PIN" icon="lock">
            <div className="form-grid">
              <label>
                New 4-digit PIN
                <input inputMode="numeric" maxLength={4} value={pin.next} onChange={(e) => setPin({ ...pin, next: e.target.value.replace(/\D/g, '') })} />
              </label>
              <label>
                Confirm
                <input inputMode="numeric" maxLength={4} value={pin.confirm} onChange={(e) => setPin({ ...pin, confirm: e.target.value.replace(/\D/g, '') })} />
              </label>
              <div className="span-2 form-actions">
                <button type="button" className="btn" onClick={() => void savePin()} disabled={pin.next.length !== 4}>
                  Change PIN
                </button>
              </div>
            </div>
            <p className="muted small">
              The PIN keeps little hands out of the Parent Studio. It is not a security boundary against adults with access to this device.
            </p>
          </Card>
        </div>

        <div className="stack">
          <Card title="Activity interpretation" icon="sparkle">
            <p className="small">
              When you describe a day, <strong>{remoteOn ? 'your configured AI service' : 'on-device rules'}</strong> suggest skills and evidence. You always
              review before anything is saved.
            </p>
            <fieldset className="radio-list">
              <label className="check">
                <input
                  type="radio"
                  name="interp"
                  checked={s.interpretation.provider === 'local'}
                  onChange={() => void patch({ interpretation: { provider: 'local', consentToSend: false } }, 'Using on-device interpretation.')}
                />{' '}
                On-device (default, private)
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="interp"
                  checked={s.interpretation.provider === 'http'}
                  onChange={() => void patch({ interpretation: { ...s.interpretation, provider: 'http' } })}
                />{' '}
                My own AI endpoint (advanced)
              </label>
            </fieldset>
            {s.interpretation.provider === 'http' && (
              <div className="form-grid">
                <label className="span-2">
                  Endpoint URL (HTTPS)
                  <input
                    type="url"
                    value={endpoint}
                    placeholder="https://your-server.example/interpret"
                    onChange={(e) => setEndpoint(e.target.value)}
                    onBlur={() => void patch({ interpretation: { ...s.interpretation, endpoint: endpoint.trim() } })}
                  />
                </label>
                <label className="check span-2">
                  <input
                    type="checkbox"
                    checked={s.interpretation.consentToSend}
                    disabled={!endpoint.trim().startsWith('https://')}
                    onChange={(e) => void patch({ interpretation: { ...s.interpretation, endpoint: endpoint.trim(), consentToSend: e.target.checked } })}
                  />
                  I understand the text I type and {child.name}’s first name will be sent to this endpoint. Photos, records and history are never sent.
                </label>
                <p className="muted small span-2">
                  If the endpoint fails or returns invalid data, on-device rules are used automatically. The expected request/response format is documented in
                  the README.
                </p>
              </div>
            )}
          </Card>

          {s.demoTools && (
            <Card title="Milestone previews" icon="star">
              <p className="muted small">Peek at how the school grows. Previews never change saved progress, and a banner in the school says it’s a preview.</p>
              <div className="preview-grid">
                {MILESTONE_PREVIEWS.map((p) => (
                  <button key={p.id} type="button" className="preview-btn" onClick={() => preview(p.id)} data-testid={`preview-${p.id}`}>
                    <span className="preview-icon">{p.icon}</span>
                    <strong>{p.label}</strong>
                    <span className="muted small">{p.description}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card title="Demo data" icon="info">
            <label className="check">
              <input type="checkbox" checked={s.demoTools} onChange={(e) => void patch({ demoTools: e.target.checked })} /> Show demo tools (previews, PIN hint)
            </label>
            <p className="muted small">
              The sample history (marked “demo”) shows how things look after a few weeks. Resetting replaces all records on this device with the sample.
            </p>
            {!confirmReset ? (
              <button type="button" className="btn" onClick={() => setConfirmReset(true)}>
                Reset to sample data…
              </button>
            ) : (
              <div className="confirm-row">
                <span className="small">This erases everything on this device and restores the sample.</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    void services.resetDemo().then(() => {
                      setConfirmReset(false);
                      setMsg('Sample data restored.');
                    });
                  }}
                >
                  Erase & restore sample
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </div>
            )}
          </Card>

          <Card title={`${child.name}’s data`} icon="download">
            <button type="button" className="btn" onClick={() => void download()}>
              <Icon name="download" size={16} /> Export all records (JSON)
            </button>
            <p className="muted small">
              A complete, portable copy of books, evidence, mastery, activities, conversations and reports (photos referenced by id).
            </p>
            <div className="danger-zone">
              <label htmlFor="del-name" className="small">
                Delete all of {child.name}’s records and photos — type <strong>{child.name}</strong> to confirm
              </label>
              <div className="inline-form">
                <input id="del-name" value={deleteName} onChange={(e) => setDeleteName(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={deleteName !== child.name}
                  onClick={() => {
                    void deleteChildData(ctx, child.id).then(() => {
                      setDeleteName('');
                      setMsg(`${child.name}’s learning records were deleted. Her profile and avatar remain.`);
                    });
                  }}
                >
                  Delete records
                </button>
              </div>
            </div>
          </Card>

          <Card title="Privacy" icon="lock">
            <ul className="privacy-points small">
              <li>
                🏠 All records and photos are stored in this browser on this device
                {persistent ? '' : ' (currently in temporary memory — this browser blocked storage)'}.
              </li>
              {storage && storage.quota > 0 && (
                <li>
                  💾 Using {mb(storage.usage)} of {mb(storage.quota)} available.
                </li>
              )}
              <li>🚫 No accounts, ads, analytics, trackers, social features or public profiles.</li>
              <li>🔗 {child.name}’s screens contain no links to outside websites.</li>
              <li>📷 Photos are resized and re-encoded on upload, which also strips hidden location data (EXIF).</li>
              <li>🙈 No face recognition or biometric processing, ever.</li>
              <li>👀 Every teacher conversation is visible to you in “Teacher talk”.</li>
              <li>🤝 Nothing leaves this device unless you turn on an external service above.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
