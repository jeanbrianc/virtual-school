import { useEffect, useState } from 'react';
import { navigate } from '../../../app/router';
import { useLiveQuery, useServices } from '../../../app/services';
import { DEFAULT_TEACHER_AI_ENDPOINT, HOSTED_BUILD } from '../../../domain/settings';
import { checkHelper, isAllowedHelperUrl } from '../../../domain/teachers/chatRemote';
import type { AudioSettings, GraphicsQuality, HouseholdSettings } from '../../../domain/types';
import { browserFamily, knownOnDevice } from '../../../domain/talk';
import { getSpeechProbe, runSpeechProbe, settleInterruptedProbe } from '../../../services/talkService';
import type { TalkMode } from '../../../voice/SpeechService';
import { buildMilestonePreview, MILESTONE_PREVIEWS, type MilestonePreviewId } from '../../../domain/world/previews';
import { deleteChildData, exportChildData, updateSettings } from '../../../services/householdService';
import { snapshotFromRecords } from '../../../services/learningCore';
import { appStore } from '../../../state/appState';
import { shelfBooksFrom } from '../../child/useChildWorld';
import { Icon } from '../../shared/Icon';
import { Card, PageHeader } from '../components';
import { VoiceCard } from './VoiceCard';
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

const TALK_OPTIONS: { mode: TalkMode; label: string; note: string }[] = [
  { mode: 'device', label: 'On this computer only (recommended)', note: 'Her voice is turned into words right here. The audio never leaves this computer.' },
  {
    mode: 'browser',
    label: 'Also allow the browser’s speech service',
    note: 'If on-device listening isn’t available, the browser sends her audio to its maker (Google for Chrome, Apple for Safari) to turn it into words.',
  },
  { mode: 'off', label: 'Off', note: 'No microphone in the school. She can still tap and type.' },
];

/** Talking to teachers: which recognizer may hear her, plus a one-time voice pack download and a mic test. */
function TalkCard({ mode, childName, onMode }: { mode: TalkMode; childName: string; onMode: (m: TalkMode) => void }) {
  const { ctx, speechIn, speechOut } = useServices();
  const browser = browserFamily(navigator.userAgent);
  const probe = useLiveQuery(() => getSpeechProbe(ctx), [], ['meta']);
  const known = knownOnDevice(probe, browser);
  const avail = speechIn.check(mode, known);
  const [working, setWorking] = useState<'checking' | 'installing' | null>(null);
  const [test, setTest] = useState<{ state: 'idle' | 'listening' | 'done'; text?: string }>({ state: 'idle' });

  // A check that never finished means it crashed the tab last time: remember that.
  useEffect(() => {
    void settleInterruptedProbe(ctx);
  }, [ctx]);

  const checkBrowser = async () => {
    setWorking('checking');
    await runSpeechProbe(ctx, browser, () => speechIn.probe());
    setWorking(null);
  };
  const install = async () => {
    setWorking('installing');
    await speechIn.install();
    await runSpeechProbe(ctx, browser, () => speechIn.probe());
    setWorking(null);
  };
  const runTest = async () => {
    setTest({ state: 'listening' });
    speechOut.cancel();
    const out = await speechIn.listen(mode, known, { maxMs: 8000, onInterim: (t) => setTest({ state: 'listening', text: t }) });
    setTest({
      state: 'done',
      text: out.result
        ? `Heard: “${out.result.transcript}” — ${out.result.onDevice ? 'recognized on this computer.' : 'recognized by the browser’s speech service.'}`
        : out.error === 'not-allowed'
          ? 'The browser blocked the microphone. Allow it in the address bar’s site settings, then try again.'
          : out.error === 'no-microphone'
            ? 'No microphone was found.'
            : 'Didn’t hear anything — try again a little closer to the microphone.',
    });
  };

  const crashed = probe?.answer === 'crashed' && probe.browser === browser;
  const status =
    avail.state === 'ready'
      ? avail.onDevice
        ? '✅ Ready — listening happens on this computer.'
        : '✅ Ready — using the browser’s speech service.'
      : avail.state === 'needs-check'
        ? 'Not set up yet. Her first tap on the microphone does this automatically — or check this browser now.'
        : avail.state === 'needs-download'
          ? 'One more step: download the on-device voice pack (a one-time download from your browser, around 60 MB).'
          : avail.state === 'downloading'
            ? '⏳ The voice pack is downloading…'
            : avail.state === 'unsupported'
              ? crashed
                ? 'Checking for on-device listening closed this browser tab last time, so it’s turned off here. Choose the browser’s speech service below, or try current Google Chrome.'
                : mode === 'device'
                  ? 'This browser can’t recognize speech on-device. Current Chrome on a Mac or PC can — or choose the option below.'
                  : 'This browser has no speech recognition. She can still tap and type.'
              : 'Off.';

  return (
    <Card title="Talking to teachers" icon="mic">
      <p className="small">
        {childName} can tap the microphone and just <em>tell</em> a teacher things — “I read Daddy the Goodnight Leelanau book” — instead of typing.
      </p>
      <fieldset className="radio-list">
        {TALK_OPTIONS.map((o) => (
          <label key={o.mode} className="check check-stacked">
            <input type="radio" name="talk" checked={mode === o.mode} onChange={() => onMode(o.mode)} data-testid={`talk-${o.mode}`} />
            <span>
              {o.label}
              <span className="muted small check-note">{o.note}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {mode !== 'off' && (
        <>
          <p className="small" data-testid="talk-status">
            {status}
          </p>
          <div className="form-actions">
            {avail.state === 'needs-check' && (
              <button type="button" className="btn btn-primary btn-small" disabled={!!working} onClick={() => void checkBrowser()} data-testid="talk-check">
                {working === 'checking' ? 'Checking…' : 'Check this browser'}
              </button>
            )}
            {avail.state === 'needs-download' && (
              <button type="button" className="btn btn-primary btn-small" disabled={!!working} onClick={() => void install()}>
                {working === 'installing' ? 'Downloading…' : 'Download the voice pack'}
              </button>
            )}
            {(avail.state === 'downloading' || (crashed && speechIn.canProbe)) && (
              <button type="button" className="btn btn-small" disabled={!!working} onClick={() => void checkBrowser()}>
                Check again
              </button>
            )}
            {avail.state === 'ready' && (
              <button type="button" className="btn btn-small" disabled={test.state === 'listening'} onClick={() => void runTest()} data-testid="talk-test">
                <Icon name="mic" size={14} /> {test.state === 'listening' ? 'Listening… say something' : 'Test the microphone'}
              </button>
            )}
          </div>
          {test.text && <p className="muted small">{test.text}</p>}
          <p className="muted small">
            The browser asks once for permission to use the microphone. She sees what was heard before a teacher answers, and when she talks by voice the
            teacher answers out loud.
          </p>
        </>
      )}
    </Card>
  );
}

/** Optional AI teachers through the family's local helper. */
function AiTeachersCard({
  settings,
  childName,
  onPatch,
}: {
  settings: HouseholdSettings['teacherAi'];
  childName: string;
  onPatch: (p: Partial<HouseholdSettings['teacherAi']>) => void;
}) {
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const valid = isAllowedHelperUrl(endpoint.trim());
  const on = settings.enabled && settings.consentToSend;
  const runCheck = async () => {
    setChecking(true);
    setCheck(await checkHelper(endpoint.trim()));
    setChecking(false);
  };
  return (
    <Card title="AI teachers (optional)" icon="sparkle">
      <p className="small">
        <strong>{on ? 'On' : 'Off'}.</strong>{' '}
        {on
          ? `Professor Hoot, Digit and Nova answer what ${childName} says with Claude, an AI model from Anthropic, through the helper on this computer.`
          : `Teachers answer with built-in replies that run on this device. They understand things like which book she read, who she read it with, and whether she finished — but not much beyond books. Turn this on for replies to anything she says.`}
      </p>
      <details className="small">
        <summary>What is sent, and how to set it up</summary>
        <p>
          <strong>Sent to Anthropic for each reply:</strong> {childName}’s first name, the words she said to the teacher (as text — never audio), the last few
          lines of that conversation, and her book titles. The teachers’ instructions also say she’s a young child who reads well above her age.{' '}
          <strong>Never sent:</strong> photos, birthdays, records, reports or her voice. Anthropic doesn’t train its models on API data by default.
        </p>
        <p>
          <strong>Safety:</strong> the teachers’ instructions live in the helper (a web page can’t change them). Every reply is checked on this device before
          she sees it; anything unsuitable, and any problem, falls back to the built-in teacher. If she says she’s hurt, scared or unsafe, the answer is always
          the on-device “please tell Mom or Dad right now,” and you’ll see a note on Today. Every word is in Teacher talk, with AI lines marked.
        </p>
        {DEFAULT_TEACHER_AI_ENDPOINT.startsWith('/') ? (
          <ol>
            <li>Create an API key at console.anthropic.com (usage is billed to your account — roughly a fifth of a cent per reply with the default model).</li>
            <li>
              This website has its own helper at <code>{DEFAULT_TEACHER_AI_ENDPOINT}</code> (a small AWS Lambda behind the site password). The key is stored in
              your AWS account and never reaches the browser — run <code>scripts/deploy/aws-deploy.sh</code> to add or change it.
            </li>
          </ol>
        ) : (
          <ol>
            <li>Create an API key at console.anthropic.com (usage is billed to your account — roughly a fifth of a cent per reply with the default model).</li>
            <li>
              In the project folder, copy <code>.env.example</code> to <code>.env.local</code> and paste the key after <code>ANTHROPIC_API_KEY=</code>.
            </li>
            <li>
              Restart <code>npm run dev</code> — it starts the helper on <code>{DEFAULT_TEACHER_AI_ENDPOINT}</code> automatically. The key stays in that file
              and never reaches the browser.
            </li>
          </ol>
        )}
      </details>
      <div className="form-grid">
        <label className="span-2">
          Helper address
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            onBlur={() => onPatch({ endpoint: endpoint.trim() })}
            data-testid="ai-endpoint"
          />
        </label>
        <div className="span-2 form-actions">
          <button type="button" className="btn btn-small" disabled={!valid || checking} onClick={() => void runCheck()} data-testid="ai-check">
            {checking ? 'Checking…' : 'Check connection'}
          </button>
          {check && <span className={`small ${check.ok ? 'good' : 'muted'}`}>{check.message}</span>}
        </div>
        <label className="check span-2">
          <input
            type="checkbox"
            checked={settings.consentToSend}
            disabled={!valid}
            onChange={(e) => onPatch({ endpoint: endpoint.trim(), consentToSend: e.target.checked, ...(e.target.checked ? {} : { enabled: false }) })}
            data-testid="ai-consent"
          />
          I understand {childName}’s words to her teachers (as text) and her first name will be sent to Anthropic to write the teachers’ replies.
        </label>
        <label className="check span-2">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!settings.consentToSend || !valid}
            onChange={(e) => onPatch({ endpoint: endpoint.trim(), enabled: e.target.checked })}
            data-testid="ai-enabled"
          />
          Turn on AI teachers
        </label>
      </div>
    </Card>
  );
}

export function SettingsPage({ data }: { data: ParentData }) {
  const services = useServices();
  const { ctx, audio, persistent } = services;
  const { household, child, records } = data;
  const s = household.settings;
  const [pin, setPin] = useState({ next: '', confirm: '' });
  const [endpoint, setEndpoint] = useState(s.interpretation.endpoint ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<'fresh' | 'sample' | null>(null);
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

          <VoiceCard settings={s} child={child} patch={(p) => patch(p)} />

          <TalkCard mode={s.talkMode} childName={child.name} onMode={(m) => void patch({ talkMode: m })} />

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
          <AiTeachersCard settings={s.teacherAi} childName={child.name} onPatch={(p) => void patch({ teacherAi: { ...s.teacherAi, ...p } })} />

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
                  Endpoint URL
                  <input
                    type="text"
                    value={endpoint}
                    placeholder={`${s.teacherAi.endpoint}/v1/interpret`}
                    onChange={(e) => setEndpoint(e.target.value)}
                    onBlur={() => void patch({ interpretation: { ...s.interpretation, endpoint: endpoint.trim() } })}
                  />
                </label>
                <label className="check span-2">
                  <input
                    type="checkbox"
                    checked={s.interpretation.consentToSend}
                    disabled={!isAllowedHelperUrl(endpoint.trim())}
                    onChange={(e) => void patch({ interpretation: { ...s.interpretation, endpoint: endpoint.trim(), consentToSend: e.target.checked } })}
                  />
                  I understand the text I type and {child.name}’s first name will be sent to this endpoint. Photos, records and history are never sent.
                </label>
                <p className="muted small span-2">
                  With the AI helper running (see AI teachers), use <code>{s.teacherAi.endpoint}/v1/interpret</code>. If the endpoint fails or returns invalid
                  data, on-device rules are used automatically. The expected request/response format is documented in the README.
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

          <Card title="Start over or try the sample" icon="info">
            <p className="muted small">
              <strong>Start fresh</strong> clears every book, record, portfolio item and conversation so the school is brand new again. Names, avatars, the PIN
              and settings stay. <strong>Sample data</strong> replaces everything with a few weeks of clearly labeled example history, handy for trying the
              Parent Studio.
            </p>
            {confirmReset === null ? (
              <div className="row-actions">
                <button type="button" className="btn" onClick={() => setConfirmReset('fresh')} data-testid="start-fresh">
                  Start fresh…
                </button>
                <button type="button" className="btn" onClick={() => setConfirmReset('sample')} data-testid="load-sample">
                  Load sample data…
                </button>
              </div>
            ) : (
              <div className="confirm-row">
                <span className="small">
                  {confirmReset === 'fresh'
                    ? 'This permanently erases all learning records on this device.'
                    : 'This permanently replaces everything on this device with sample data.'}
                </span>
                <button
                  type="button"
                  className="btn btn-danger"
                  data-testid="confirm-reset"
                  onClick={() => {
                    const run = confirmReset === 'fresh' ? services.startFresh() : services.loadSampleData();
                    void run.then(() => {
                      setMsg(confirmReset === 'fresh' ? 'All set — the school is brand new again.' : 'Sample data loaded. It’s marked “demo” everywhere.');
                      setConfirmReset(null);
                    });
                  }}
                >
                  {confirmReset === 'fresh' ? 'Erase & start fresh' : 'Erase & load sample'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(null)}>
                  Cancel
                </button>
              </div>
            )}
            <label className="check">
              <input type="checkbox" checked={s.demoTools} onChange={(e) => void patch({ demoTools: e.target.checked })} /> Show milestone previews and the PIN
              hint
            </label>
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

          {HOSTED_BUILD && (
            <Card title="This device" icon="lock">
              <p className="small">
                This browser is signed in to the family school. Signing out shows the welcome page again until someone enters the family password.
              </p>
              <a className="btn btn-small" href="/auth/logout" data-testid="sign-out">
                Sign out of the school on this device
              </a>
            </Card>
          )}

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
              <li>
                🎤 Her voice is never recorded or stored — only the words, and only{' '}
                {s.talkMode === 'browser' ? 'the browser’s speech service (if needed) hears the audio' : 'this computer hears the audio'}.
              </li>
              <li>🤝 Nothing leaves this device unless you turn on an external service above.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
