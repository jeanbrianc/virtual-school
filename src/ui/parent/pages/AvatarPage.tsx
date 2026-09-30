import { useEffect, useRef, useState } from 'react';
import { useServices } from '../../../app/services';
import { ACCESSORIES, DEFAULT_AVATAR, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, OUTFITS, SKIN_TONES } from '../../../domain/avatar';
import type { DanceMoveId } from '../../../domain/play/circuit';
import type { Avatar, AvatarConfig } from '../../../domain/types';
import { addMedia, saveAvatar } from '../../../services/householdService';
import { Icon } from '../../shared/Icon';
import { Card, MediaImage, PageHeader, prepareImage } from '../components';
import type { ParentData } from '../ParentApp';
import { CircuitCard } from './CircuitCard';

type PreviewHandle = { setConfig(cfg: AvatarConfig): void; perform(move: DanceMoveId): Promise<void>; resize(): void; dispose(): void };

function configOf(a: Avatar | undefined): AvatarConfig {
  if (!a) return DEFAULT_AVATAR;
  const { skinTone, hairStyle, hairColor, eyeColor, outfit, outfitColor, accentColor, accessory, shoeColor } = a;
  return { skinTone, hairStyle, hairColor, eyeColor, outfit, outfitColor, accentColor, accessory, shoeColor };
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: readonly string[]; value: string; onChange: (c: string) => void }) {
  return (
    <fieldset className="swatches">
      <legend>{label}</legend>
      <div className="swatch-row">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${c === value ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={`${label} ${c}`}
            aria-pressed={c === value}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Options<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="opt-group">
      <legend>{label}</legend>
      <div className="chip-row">
        {options.map((o) => (
          <button key={o.id} type="button" className={`chip ${o.id === value ? 'active' : ''}`} onClick={() => onChange(o.id)} aria-pressed={o.id === value}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Avatar editor with a live 3D turntable. An optional inspiration photo can
 * be kept beside the controls as a reference for choosing features by hand —
 * it is stored only on this device and is never analysed or uploaded.
 */
export function AvatarPage({ data }: { data: ParentData }) {
  const { ctx } = useServices();
  const { child, avatar } = data;
  const [cfg, setCfg] = useState<AvatarConfig>(() => configOf(avatar));
  const [saved, setSaved] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<PreviewHandle | null>(null);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(configOf(avatar));

  useEffect(() => {
    setCfg(configOf(avatar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar?.id]);

  useEffect(() => {
    let disposed = false;
    void import('../../../engine/portrait')
      .then(({ AvatarPreview }) => {
        if (disposed || !host.current) return;
        preview.current = new AvatarPreview(host.current, cfg);
      })
      .catch(() => setPreviewError(true));
    const onResize = () => preview.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      preview.current?.dispose();
      preview.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    preview.current?.setConfig(cfg);
    setSaved(false);
  }, [cfg]);

  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    const base: Avatar = avatar ?? { ...DEFAULT_AVATAR, id: child.avatarId, childId: child.id, updatedAt: new Date().toISOString() };
    await saveAvatar(ctx, { ...base, ...cfg });
    setSaved(true);
  };

  /** "Try it" on a circuit number: the preview does the move (scrolled into view on small screens). */
  const tryMove = (move: DanceMoveId) => {
    const el = host.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 80 || r.top > window.innerHeight - 80) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    void preview.current?.perform(move);
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file || !avatar) return;
    const img = await prepareImage(file);
    const m = await addMedia(ctx, { blob: img.blob, childId: child.id, caption: 'Avatar inspiration (private)', width: img.width, height: img.height });
    const old = avatar.inspirationMediaId;
    await saveAvatar(ctx, { ...avatar, ...cfg, inspirationMediaId: m.id });
    if (old) await ctx.repos.media.delete(old);
  };

  const removePhoto = async () => {
    if (!avatar?.inspirationMediaId) return;
    const { inspirationMediaId, ...rest } = avatar;
    await saveAvatar(ctx, { ...rest, ...cfg });
    await ctx.repos.media.delete(inspirationMediaId);
  };

  return (
    <div className="page">
      <PageHeader
        title={`${child.name}’s avatar`}
        subtitle="Pick features together — she’ll see herself walking around her school."
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCfg(configOf(avatar))} disabled={!dirty}>
              Undo changes
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!dirty} data-testid="avatar-save">
              <Icon name="check" size={16} /> {saved ? 'Saved' : 'Save avatar'}
            </button>
          </>
        }
      />
      <div className="avatar-layout">
        <div className="avatar-stage-col">
          <div className="avatar-stage" ref={host} aria-label="Avatar preview">
            {previewError && <p className="muted small">3D preview unavailable in this browser.</p>}
          </div>
          <Card title="Inspiration photo (optional)" icon="photo" className="inspiration">
            {avatar?.inspirationMediaId ? (
              <div className="inspiration-photo">
                <MediaImage id={avatar.inspirationMediaId} alt="Inspiration photo" />
                <button type="button" className="btn btn-small btn-ghost danger" onClick={() => void removePhoto()}>
                  <Icon name="trash" size={14} /> Remove photo
                </button>
              </div>
            ) : (
              <label className="upload-drop">
                <Icon name="upload" size={20} />
                <span>Add a photo to keep beside the controls while you choose</span>
                <input type="file" accept="image/*" onChange={(e) => void onPhoto(e.target.files?.[0])} />
              </label>
            )}
            <ul className="privacy-points small">
              <li>🔒 Stays on this device only. Never uploaded, shared or analysed.</li>
              <li>🙈 No face recognition or biometric processing — you choose features by eye.</li>
              <li>🧩 A photo-to-avatar generator could be added later as an explicit, opt-in service; none is enabled.</li>
            </ul>
          </Card>
        </div>
        <div className="avatar-right-col">
          <Card className="avatar-controls">
            <Swatches label="Skin tone" colors={SKIN_TONES} value={cfg.skinTone} onChange={(v) => set('skinTone', v)} />
            <Options label="Hair style" options={HAIR_STYLES} value={cfg.hairStyle} onChange={(v) => set('hairStyle', v)} />
            <Swatches label="Hair color" colors={HAIR_COLORS} value={cfg.hairColor} onChange={(v) => set('hairColor', v)} />
            <Swatches label="Eye color" colors={EYE_COLORS} value={cfg.eyeColor} onChange={(v) => set('eyeColor', v)} />
            <Options label="Outfit" options={OUTFITS} value={cfg.outfit} onChange={(v) => set('outfit', v)} />
            <Swatches label="Outfit color" colors={OUTFIT_COLORS} value={cfg.outfitColor} onChange={(v) => set('outfitColor', v)} />
            <Swatches label="Accent color" colors={OUTFIT_COLORS} value={cfg.accentColor} onChange={(v) => set('accentColor', v)} />
            <Options label="Accessory" options={ACCESSORIES} value={cfg.accessory} onChange={(v) => set('accessory', v)} />
            <Swatches label="Shoes" colors={OUTFIT_COLORS} value={cfg.shoeColor} onChange={(v) => set('shoeColor', v)} />
          </Card>
          <CircuitCard child={child} {...(previewError ? {} : { onTry: tryMove })} />
        </div>
      </div>
    </div>
  );
}
