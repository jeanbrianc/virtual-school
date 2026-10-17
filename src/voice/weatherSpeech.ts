import type { SpeechOutput } from './SpeechService';
/** The caller supplies only authored lab prompts; no child name, notes, or user text. */
export function weatherSpeech(output: SpeechOutput, auto: boolean, muted: boolean, volume: number) {
  const canSpeak = !muted && output.available && !!output.voiceFor();
  return {
    auto: auto && canSpeak,
    canSpeak,
    speak(text: string) {
      const voice = output.voiceFor();
      if (muted || !voice) return;
      void output.speak(text, { localOnly: true, voiceName: voice.name, volume, rate: 0.9 }).catch(() => {});
    },
    cancel() {
      output.cancel();
    },
  };
}
