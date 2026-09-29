import { useEffect, useState } from 'react';
import { useServices } from '../../../app/services';
import { cleanSayName, nameTestLine, sayNameSuggestions } from '../../../domain/pronounce';
import { TEACHERS } from '../../../domain/teachers/teachers';
import type { Child, HouseholdSettings } from '../../../domain/types';
import { updateChild } from '../../../services/householdService';
import type { VoiceInfo } from '../../../voice/SpeechService';
import { Icon } from '../../shared/Icon';
import { Card } from '../components';

/** "Samantha (English (US))" → "Samantha"; keeps the region when it isn't already in the name. */
function voiceLabel(v: VoiceInfo): string {
  const region = v.lang.split(/[-_]/)[1]?.toUpperCase();
  return /\(/.test(v.name) || !region ? v.name : `${v.name} (${region})`;
}

/**
 * Read-aloud: whether teachers read automatically, which built-in voice they
 * use, and how that voice should say her name (a respelling used only for speech).
 */
export function VoiceCard({
  settings: s,
  child,
  patch,
}: {
  settings: HouseholdSettings;
  child: Child;
  patch: (p: Partial<HouseholdSettings>) => Promise<void>;
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

  const hear = (spoken: string) => {
    const hoot = TEACHERS.hoot.voice;
    void speechOut.speak(nameTestLine(spoken), {
      pitch: hoot.pitch,
      rate: hoot.rate,
      volume: s.audio.voice || 0.9,
      ...(s.voiceName ? { voiceName: s.voiceName } : {}),
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
        <input type="checkbox" checked={s.readAloud} disabled={!speechOut.available} onChange={(e) => void patch({ readAloud: e.target.checked })} /> Teachers
        read their lines aloud automatically
      </label>
      {!speechOut.available ? (
        <p className="muted small">This browser has no built-in speech voices; text and pictures are always shown.</p>
      ) : (
        <>
          <p className="muted small">Uses the voices built into this computer. A speaker button is always available for any line.</p>

          <label htmlFor="voice-pick">Reading voice</label>
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
