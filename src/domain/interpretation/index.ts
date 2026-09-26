import type { InterpretationSettings } from '../types';
import { LocalHeuristicInterpreter } from './localInterpreter';
import { HttpInterpretationService } from './remoteInterpreter';
import type { ActivityInterpretationService } from './types';

export * from './types';
export { interpretLocally, LocalHeuristicInterpreter, LOCAL_INTERPRETER_VERSION } from './localInterpreter';
export { HttpInterpretationService, validateInterpretation, INTERPRETATION_JSON_SCHEMA } from './remoteInterpreter';

/**
 * Chooses the interpretation provider. The remote provider is used only when a
 * parent has configured an endpoint AND explicitly consented to sending
 * narratives off the device; otherwise everything stays local.
 */
export function createInterpretationService(settings: InterpretationSettings): ActivityInterpretationService {
  if (settings.provider === 'http' && settings.endpoint && settings.consentToSend) {
    return new HttpInterpretationService(settings.endpoint);
  }
  return new LocalHeuristicInterpreter();
}
