import type { SpeechOutput } from '../../../voice/SpeechService';
import { TEACHERS } from '../../../domain/teachers/teachers';
import type { Speech } from '../DialogueShell';

/** Pictures remain usable when a verified local read-aloud voice is unavailable. */
export function routineSpeech(output: SpeechOutput, settings: { auto: boolean; muted: boolean; volume: number }): Speech {
  const canSpeak = !!output.voiceFor();
  return {
    canSpeak,
    auto: settings.auto && canSpeak,
    speak(text) {
      const voice = output.voiceFor();
      if (settings.muted || !voice) return;
      void output.speak(text, { ...TEACHERS.tavi.voice, voiceName: voice.name, localOnly: true, volume: settings.volume });
    },
  };
}
