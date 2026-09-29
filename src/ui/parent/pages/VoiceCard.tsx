import { useEffect, useState } from 'react';
import { useServices } from '../../../app/services';
import { cleanSayName, nameTestLine, sayNameSuggestions } from '../../../domain/pronounce';
import { isAllowedHelperUrl, naturalVoicesOn, type HelperStatus } from '../../../domain/teachers/chatRemote';
import { TEACHERS } from '../../../domain/teachers/teachers';
import type { Child, HouseholdSettings } from '../../../domain/types';
import { updateChild } from '../../../services/householdService';
import { clearNaturalVoiceCache } from '../../../voice/helperVoice';
import type { VoiceInfo } from '../../../voice/SpeechService';
import { Icon } from '../../shared/Icon';
import { Card } from '../components';

/** "Samantha (English (US))" → "Samantha"; keeps the region when it isn't already in the name. */
function voiceLabel(v: VoiceInfo): string {
  const region = v.lang.split(/[-_]/)[1]?.toUpperCase();
  return /\(/.test(v.name) || !region ? v.name : `${v.name} (${region})`;
}

/**
 * Read-aloud: whether teachers read automatically, natural AI voices (through
 * the family's helper) or the voices built into this computer, and how the
 * voices should say her name (a respelling used only for speech).
 */
export function VoiceCard({
  settings: s,
  child,
  patch,
  helper,
}: {
  settings: HouseholdSettings;
  child: Child;
  patch: (p: Partial<HouseholdSettings>) => Promise<void>;
  /** What the AI helper can do (null until checked). */
  helper: HelperStatus | null;
}) {
  const { ctx, speechOut } = useServices();
  const [voices, setVoices] = useState<VoiceInfo[]>(() => speechOut.voices());
  const [draft, setDraft] = useState(child.sayName ?? '');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setVoices(speechOut.voices());
    return speechOut.onVoicesChanged(() => setVoices(speechOut.voices()));
  }, [speechOut]);
  // Follow the saved respelling (and a switch to another child) without wiping the "saved" note.
  useEffect(() => setDraft(child.sayName ?? ''), [child.id, child.sayName]);
  useEffect(() => setSaved(null), [child.id]);

  const auto = speechOut.voiceFor();
  const chosenHere = s.voiceName ? voices.some((v) => v.name === s.voiceName) : true;
  const suggestions = sayNameSuggestions(child.name);
  const clean = cleanSayName(draft);
  const current = child.sayName ?? '';
  const dirty = clean !== current && !(clean.toLowerCase() === child.name.toLowerCase() && !current);

  const natural = naturalVoicesOn(s.teacherAi);
  const canSpeak = speechOut.available || natural;
  const setNatural = (on: boolean) => {
    void patch({ teacherAi: { ...s.teacherAi, naturalVoices: on } });
    // Spoken lines saved in this browser go when natural voices are turned off.
    if (!on) void clearNaturalVoiceCache();
  };

  const hear = (spoken: string) => {
    const hoot = TEACHERS.hoot.voice;
    void speechOut.speak(nameTestLine(spoken), {
      pitch: hoot.pitch,
      rate: hoot.rate,
      volume: s.audio.voice || 0.9,
      ...(s.voiceName ? { voiceName: s.voiceName } : {}),
      ...(natural ? { natural: { endpoint: s.teacherAi.endpoint, teacher: 'hoot' as const } } : {}),
    });
  };

  const save = async (value: string) => {
    const say = cleanSayName(value);
    const { sayName: _old, ...rest } = child;
    const keep = say && say.toLowerCase() !== child.name.toLowerCase();
    await updateChild(ctx, keep ? { ...rest, sayName: say } : rest);
    setDraft(keep ? say : '');
    setSaved(keep ? `Voices now say “${say}”.` : `Voices read “${child.name}” as written.`);
  };

  return (
    <Card title="Voice" icon="mic">
      <label className="check">
        <input type="checkbox" checked={s.readAloud} disabled={!canSpeak} onChange={(e) => void patch({ readAloud: e.target.checked })} /> Teachers read their
        lines aloud automatically
      </label>
      <p className="muted small">A speaker button is always available for any line.</p>

      <div className="natural-voices" data-testid="natural-voices">
        <label className="check">
          <input
            type="checkbox"
            checked={natural}
            disabled={!natural && (!helper?.voices || !isAllowedHelperUrl(s.teacherAi.endpoint))}
            onChange={(e) => setNatural(e.target.checked)}
            data-testid="natural-toggle"
          />{' '}
          Natural teacher voices (OpenAI)
        </label>
        <p className="muted small">
          {helper?.voices || natural ? (
            <>
              Professor Hoot, Digit and Nova each get their own natural, AI-generated voice. The words a teacher says — including {child.name}’s name and their
              answers to her — go to your AI helper and on to OpenAI to be spoken. OpenAI keeps them up to 30 days for abuse checks unless your OpenAI
              organization has zero data retention. Spoken lines are saved in this browser, so a repeated line is instant and free. If the helper can’t be
              reached, the computer’s own voice reads instead.
            </>
          ) : helper ? (
            'Needs your AI helper with an OpenAI key (see AI teachers below).'
          ) : (
            'Needs your AI helper with an OpenAI key — tap Check connection under AI teachers.'
          )}
        </p>
      </div>

      {!canSpeak ? (
        <p className="muted small">This browser has no built-in speech voices; text and pictures are always shown.</p>
      ) : (
        <>
          {speechOut.available && (
            <>
              <label htmlFor="voice-pick">{natural ? 'Backup voice (built into this computer)' : 'Reading voice (built into this computer)'}</label>
              <select
                id="voice-pick"
                data-testid="voice-pick"
                value={s.voiceName && chosenHere ? s.voiceName : ''}
                // '' = automatic (the best voice on whichever device she's using).
                onChange={(e) => void patch({ voiceName: e.target.value })}
              >
                <option value="">Automatic{auto ? ` — ${voiceLabel(auto)}` : ''}</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {voiceLabel(v)}
                  </option>
                ))}
              </select>
              {s.voiceName && !chosenHere && <p className="muted small">“{s.voiceName}” isn’t on this device, so it uses the automatic voice here.</p>}
            </>
          )}

          <div className="say-name" data-testid="say-name">
            <label htmlFor="say-name-input">How the voices say “{child.name}”</label>
            <p className="muted small">
              Computer voices guess a name from its spelling. If they say it wrong, try a spelling that sounds right and tap <b>Hear it</b>. It’s only used for
              speaking — “{child.name}” stays as written everywhere else.
            </p>
            <div className="inline-form">
              <input
                id="say-name-input"
                data-testid="say-name-input"
                value={draft}
                placeholder={child.name}
                maxLength={60}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSaved(null);
                }}
              />
              <button type="button" className="btn btn-small" data-testid="say-name-hear" onClick={() => hear(clean || child.name)}>
                <Icon name="speaker" size={14} /> Hear it
              </button>
              <button type="button" className="btn btn-small btn-primary" data-testid="say-name-save" disabled={!dirty} onClick={() => void save(draft)}>
                Save
              </button>
            </div>
            {suggestions.length > 0 && (
              <div className="chip-row say-name-ideas">
                <span className="muted small">Try:</span>
                {suggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    className={`chip ${clean === sug ? 'active' : ''}`}
                    onClick={() => {
                      setDraft(sug);
                      setSaved(null);
                      hear(sug);
                    }}
                  >
                    <Icon name="speaker" size={12} /> {sug}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small" role="status">
              {saved ??
                (current ? (
                  <>
                    Voices say “{current}”.{' '}
                    <button type="button" className="btn-text" onClick={() => void save('')}>
                      Use “{child.name}” as written
                    </button>
                  </>
                ) : null)}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
