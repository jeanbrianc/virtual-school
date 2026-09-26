import type { HouseholdSettings } from './types';

/**
 * Defaults for a new household. Privacy-first: on-device interpretation, no
 * speech recognition, no read-aloud until a parent turns it on.
 */
export const DEFAULT_SETTINGS: HouseholdSettings = {
  parentPin: '1234',
  audio: { master: 0.8, effects: 0.8, ambience: 0.35, voice: 0.9, muted: false },
  readAloud: false,
  speechInput: false,
  graphicsQuality: 'high',
  interpretation: { provider: 'local', consentToSend: false },
  demoTools: true,
};
