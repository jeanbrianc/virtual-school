import type { HouseholdSettings } from './types';

/** The helper `npm run dev` starts on this computer. */
export const LOCAL_AI_HELPER = 'http://127.0.0.1:8787';

/** Hosted builds (AI_HELPER_URL=/api) use the site's own helper; local builds use this computer's. */
export const DEFAULT_TEACHER_AI_ENDPOINT = (typeof __AI_HELPER_URL__ === 'string' && __AI_HELPER_URL__) || LOCAL_AI_HELPER;

/** True for the build published to the family's own site (behind its sign-in page). */
export const HOSTED_BUILD = DEFAULT_TEACHER_AI_ENDPOINT.startsWith('/');

/**
 * Defaults for a new household. Privacy-first: on-device interpretation,
 * on-device speech recognition only, AI teachers off, no read-aloud until a
 * parent turns it on.
 */
export const DEFAULT_SETTINGS: HouseholdSettings = {
  parentPin: '1234',
  audio: { master: 0.8, effects: 0.8, ambience: 0.35, voice: 0.9, muted: false },
  readAloud: false,
  talkMode: 'device',
  graphicsQuality: 'high',
  interpretation: { provider: 'local', consentToSend: false },
  teacherAi: { enabled: false, endpoint: DEFAULT_TEACHER_AI_ENDPOINT, consentToSend: false },
  demoTools: true,
};

/** Fills settings saved by older versions (missing fields, the old speechInput switch). */
export function normalizeSettings(raw: Partial<HouseholdSettings> & { speechInput?: boolean }): HouseholdSettings {
  const { speechInput, ...rest } = raw;
  const talkMode = rest.talkMode ?? (speechInput ? 'browser' : DEFAULT_SETTINGS.talkMode);
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    talkMode,
    audio: { ...DEFAULT_SETTINGS.audio, ...(rest.audio ?? {}) },
    interpretation: { ...DEFAULT_SETTINGS.interpretation, ...(rest.interpretation ?? {}) },
    teacherAi: { ...DEFAULT_SETTINGS.teacherAi, ...(rest.teacherAi ?? {}) },
  };
}
