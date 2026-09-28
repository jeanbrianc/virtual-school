/**
 * Talking to teachers: what we remember about this browser's speech recognizer.
 *
 * Asking a browser whether it can recognize speech ON-DEVICE
 * (`SpeechRecognition.available`) is new, and some builds crash the tab when
 * asked. So the question is only ever asked from the Parent Studio, after a
 * "pending" marker is saved: if the tab dies, the marker is still there next
 * time, and on-device listening is treated as unavailable in that browser.
 * Child mode only reads the saved answer — it never asks.
 */

export type OnDeviceAnswer = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unknown';

export interface SpeechProbeRecord {
  /** 'pending' while asking; 'crashed' when a pending marker was found later. */
  answer: Exclude<OnDeviceAnswer, 'unknown'> | 'pending' | 'crashed';
  /** Browser family the answer applies to (e.g. "Chrome"), so another browser asks again. */
  browser: string;
  at: string;
}

export const SPEECH_PROBE_KEY = 'speechProbe';

/** The on-device answer to use in this browser, from the saved record. */
export function knownOnDevice(record: SpeechProbeRecord | undefined, browser: string): OnDeviceAnswer {
  if (!record || record.browser !== browser) return 'unknown';
  if (record.answer === 'pending' || record.answer === 'crashed') return 'unavailable';
  return record.answer;
}

/** "Chrome", "Edge", "Safari", "Firefox" or "Other" — coarse on purpose (no version). */
export function browserFamily(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\/|Chromium\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Other';
}
