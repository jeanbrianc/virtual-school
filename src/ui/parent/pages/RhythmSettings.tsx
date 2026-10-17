import { useState } from 'react';
import { useServices } from '../../../app/services';
import { beatCount, type BeatCount } from '../../../domain/music/rhythm';
import type { Child } from '../../../domain/types';
import { updateChild } from '../../../services/householdService';
import { Card } from '../components';

export function RhythmSettings({ child }: { child: Child }) {
  const { ctx } = useServices();
  const [value, setValue] = useState<BeatCount>(beatCount(child.rhythmBeatCount));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Milo’s music patterns" icon="sound">
      <p>Start with two beats. Choose three or four only when you and the learner want a longer pattern. Timing never changes this setting automatically.</p>
      <label htmlFor="rhythm-beats">Beats per pattern for {child.name}</label>
      <select id="rhythm-beats" value={value} disabled={busy} onChange={(event) => setValue(beatCount(Number(event.target.value)))}>
        <option value={2}>2 beats (starting pattern)</option>
        <option value={3}>3 beats</option>
        <option value={4}>4 beats</option>
      </select>
      <button
        type="button"
        className="btn btn-small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            const latest = await ctx.repos.children.get(child.id);
            if (!latest) throw new Error('Missing child');
            await updateChild(ctx, { ...latest, rhythmBeatCount: value });
            setMessage('Saved for the next music visit.');
          } catch {
            setMessage('Could not save. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Save music setting
      </button>
      <p className="muted small">
        Optional three-tap warm-up sets a comfortable pace for this visit only. Matching pictures has no timing requirement. No raw tap times, calibration pace
        or device latency are saved.
      </p>
      <p role="status">{message}</p>
    </Card>
  );
}
