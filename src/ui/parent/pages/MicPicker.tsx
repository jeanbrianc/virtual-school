import { useEffect, useRef, useState } from 'react';
import type { HouseholdSettings } from '../../../domain/types';
import { chooseMicrophone, isPhoneMic, listMicrophones, openMicrophone, type MicInfo } from '../../../voice/microphones';

type Saved = HouseholdSettings['microphone'];

/** The microphones on this computer, kept fresh when one is plugged in or removed. */
export function useMicrophones(): { list: MicInfo[]; refresh: () => Promise<void> } {
  const [list, setList] = useState<MicInfo[]>([]);
  const refresh = async () => setList(await listMicrophones());
  useEffect(() => {
    void refresh();
    const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!devices?.addEventListener) return;
    const onChange = () => void refresh();
    devices.addEventListener('devicechange', onChange);
    return () => devices.removeEventListener('devicechange', onChange);
  }, []);
  return { list, refresh };
}

/** Which microphone the school will use right now. */
export function micInUse(list: MicInfo[], saved: Saved): MicInfo | undefined {
  return chooseMicrophone(list, saved) ?? list.find((m) => m.isDefault);
}

/**
 * Microphone choice for Settings → Talking to teachers. "Automatic" is the
 * computer's default — except an iPhone/iPad Continuity mic, which is skipped
 * for the built-in one.
 */
export function MicPicker({
  list,
  refresh,
  saved,
  onChange,
}: {
  list: MicInfo[];
  refresh: () => Promise<void>;
  saved: Saved;
  onChange: (m: Saved | null) => void;
}) {
  const [asking, setAsking] = useState(false);
  const named = list.some((m) => m.label && !/^Microphone \d+$/.test(m.label));
  const auto = chooseMicrophone(list, null) ?? list.find((m) => m.isDefault);
  const current = saved && list.some((m) => m.deviceId === saved.deviceId) ? saved.deviceId : '';
  const defaultIsPhone = list.some((m) => m.isDefault && isPhoneMic(m.label));

  // Names appear once this site may use the microphone.
  const reveal = async () => {
    setAsking(true);
    try {
      const stream = await openMicrophone(null);
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Blocked: the list stays unnamed and the note below explains.
    }
    await refresh();
    setAsking(false);
  };

  if (!list.length) return null;
  return (
    <div className="mic-picker">
      <label htmlFor="mic-pick">Microphone</label>
      {named ? (
        <select
          id="mic-pick"
          data-testid="mic-pick"
          value={current}
          onChange={(e) => {
            const m = list.find((x) => x.deviceId === e.target.value);
            onChange(m ? { deviceId: m.deviceId, label: m.label } : null);
          }}
        >
          <option value="">Automatic{auto ? ` — ${auto.label}` : ''}</option>
          {list.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label}
              {isPhoneMic(m.label) ? ' (iPhone — not recommended)' : ''}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" className="btn btn-small" disabled={asking} onClick={() => void reveal()} data-testid="mic-reveal">
          {asking ? 'Asking the browser…' : 'Show this computer’s microphones'}
        </button>
      )}
      <p className="muted small">
        {defaultIsPhone
          ? 'This computer’s default microphone is an iPhone (Continuity). It often connects slowly and hears nothing, so Automatic uses the built-in microphone instead.'
          : 'Automatic uses this computer’s default microphone, but never an iPhone or iPad (Continuity) microphone.'}
      </p>
    </div>
  );
}

/** A live loudness bar for the microphone the school will use (only while `active`). */
export function MicLevel({ active, deviceId, label }: { active: boolean; deviceId: string | undefined; label: string | undefined }) {
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const frame = useRef(0);
  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    setPeak(0);
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let stopped = false;
    void (async () => {
      try {
        stream = await openMicrophone(deviceId ?? null);
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const x of samples) sum += x * x;
          const v = Math.min(1, Math.sqrt(sum / samples.length) * 6);
          setLevel(v);
          setPeak((p) => Math.max(p, v));
          frame.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setLevel(0);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame.current);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
    };
  }, [active, deviceId]);
  if (!active && !peak) return null;
  return (
    <div className="mic-level" data-testid="mic-level">
      <span className="small">Listening with {label ?? 'the default microphone'}</span>
      <span className="mic-level-bar" aria-hidden="true">
        <i style={{ width: `${Math.round(level * 100)}%` }} />
      </span>
      {!active && peak < 0.05 && <span className="small warn">That microphone heard almost nothing — try choosing another one above.</span>}
    </div>
  );
}
