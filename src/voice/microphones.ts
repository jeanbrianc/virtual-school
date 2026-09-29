/**
 * Which microphone to listen with.
 *
 * Browsers use the computer's default input, and on a Mac that is sometimes a
 * nearby iPhone (Continuity microphone) — which connects slowly or not at all,
 * so she talks and nothing is heard. We pick a real microphone instead: the one
 * a parent chose in Settings, or else the built-in one whenever the default
 * turns out to be a phone. (Device names are only visible after the browser's
 * microphone permission has been granted.)
 */

export interface MicInfo {
  deviceId: string;
  label: string;
  /** This is what the browser would use by default. */
  isDefault: boolean;
}

/** A parent's saved choice (the id can change between browsers, so the name is kept too). */
export interface MicChoice {
  deviceId: string;
  label: string;
}

const PHONE = /\b(iphone|ipad|continuity)\b|’s (iphone|ipad)|'s (iphone|ipad)/i;
const BUILT_IN = /built-?in|macbook|imac|internal|studio display/i;

export function isPhoneMic(label: string): boolean {
  return PHONE.test(label);
}

/** Chrome lists "Default - <name>" / "Communications - <name>" as extra entries; strip that prefix. */
function realName(label: string): string {
  return label.replace(/^(default|communications)\s*-\s*/i, '').trim();
}

/** Turns enumerateDevices() output into a clean list of microphones (no duplicate "Default"/"Communications" entries). */
export function microphonesFrom(devices: { kind: string; deviceId: string; label: string }[]): MicInfo[] {
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const pseudoDefault = inputs.find((d) => d.deviceId === 'default');
  const defaultName = pseudoDefault ? realName(pseudoDefault.label) : '';
  const real = inputs.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications' && d.deviceId);
  const list = real.map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label || `Microphone ${i + 1}`,
    isDefault: defaultName ? d.label === defaultName : i === 0,
  }));
  if (!list.some((m) => m.isDefault) && list[0]) list[0].isDefault = true;
  return list;
}

/**
 * The microphone to use, or null for "whatever the browser uses by default".
 *  1. The parent's choice, if this computer has it (by id, then by name).
 *  2. If the default is a phone (iPhone/iPad Continuity mic), the built-in
 *     microphone — or any other non-phone microphone.
 */
export function chooseMicrophone(list: MicInfo[], saved?: MicChoice | null): MicInfo | null {
  if (saved?.deviceId) {
    const byId = list.find((m) => m.deviceId === saved.deviceId);
    if (byId) return byId;
    const byName = saved.label ? list.find((m) => m.label === saved.label) : undefined;
    if (byName) return byName;
  }
  const def = list.find((m) => m.isDefault);
  if (def && !isPhoneMic(def.label)) return null;
  const others = list.filter((m) => !isPhoneMic(m.label));
  return others.find((m) => BUILT_IN.test(m.label)) ?? others[0] ?? null;
}

type MediaDevicesLike = Pick<MediaDevices, 'enumerateDevices' | 'getUserMedia'>;

function mediaDevices(): MediaDevicesLike | null {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.enumerateDevices === 'function' ? navigator.mediaDevices : null;
}

/** The microphones on this computer (names are blank until the site may use the microphone). */
export async function listMicrophones(devices: MediaDevicesLike | null = mediaDevices()): Promise<MicInfo[]> {
  if (!devices) return [];
  try {
    return microphonesFrom(await devices.enumerateDevices());
  } catch {
    return [];
  }
}

/** Which device to open for this listen: the parent's choice, or the built-in mic when the default is a phone. */
export async function resolveMicrophone(saved?: MicChoice | null, devices: MediaDevicesLike | null = mediaDevices()): Promise<MicInfo | null> {
  const list = await listMicrophones(devices);
  if (!list.some((m) => m.label)) return null; // no permission yet: nothing to choose between
  return chooseMicrophone(list, saved);
}

/** Speech-friendly audio constraints for a chosen device (or the default). */
export function micConstraints(deviceId?: string | null): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };
}

/** Opens a microphone; if the chosen one is gone, falls back to the default. */
export async function openMicrophone(deviceId?: string | null, devices: MediaDevicesLike | null = mediaDevices()): Promise<MediaStream> {
  if (!devices) throw Object.assign(new Error('No microphone access in this browser'), { name: 'NotSupportedError' });
  try {
    return await devices.getUserMedia({ audio: micConstraints(deviceId) });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'NotReadableError')) {
      return devices.getUserMedia({ audio: micConstraints(null) });
    }
    throw err;
  }
}
