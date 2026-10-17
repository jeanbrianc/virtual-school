/** OFFLINE executable design. Shared memory is a test double, not durable storage. */
export type Reservation = {
  id: string;
  window: string;
  maximumMicros: number;
  pricingVersion: string;
  state: 'reserved' | 'dispatched' | 'settled';
  chargedMicros?: number;
};
export interface QuotaState {
  windows: Map<string, { held: number; spent: number; blocked?: boolean }>;
  requests: Map<string, Reservation>;
  available: boolean;
}
export const newQuotaState = (): QuotaState => ({ windows: new Map(), requests: new Map(), available: true });
const positiveMoney = (value: number) => Number.isSafeInteger(value) && value > 0;

/** Each method models ONE serializable transaction. Production must enforce that in the datastore. */
export class QuotaContract {
  constructor(private readonly state: QuotaState) {}
  reserve(request: Omit<Reservation, 'state' | 'chargedMicros'>, limitMicros: number): 'reserved' | 'duplicate' | 'blocked' {
    if (
      !this.state.available ||
      !positiveMoney(limitMicros) ||
      !positiveMoney(request.maximumMicros) ||
      !request.pricingVersion ||
      !/^\d{4}-\d{2}-\d{2}$/.test(request.window)
    )
      return 'blocked';
    const previous = this.state.requests.get(request.id);
    // Never dispatch again for a duplicate, even after finalization or midnight.
    if (previous)
      return previous.window === request.window && previous.maximumMicros === request.maximumMicros && previous.pricingVersion === request.pricingVersion
        ? 'duplicate'
        : 'blocked';
    const budget = this.state.windows.get(request.window) ?? { held: 0, spent: 0 };
    if (budget.blocked || budget.held + budget.spent + request.maximumMicros > limitMicros) return 'blocked';
    budget.held += request.maximumMicros;
    this.state.windows.set(request.window, budget);
    this.state.requests.set(request.id, { ...request, state: 'reserved' });
    return 'reserved';
  }
  dispatch(id: string): boolean {
    const request = this.state.requests.get(id);
    if (!this.state.available || request?.state !== 'reserved') return false;
    request.state = 'dispatched';
    return true;
  }
  finalize(id: string, outcome: { neverDispatched: true } | { actualMicros: number } | { uncertain: true }): boolean {
    if (!this.state.available) return false;
    const request = this.state.requests.get(id);
    if (!request || request.state === 'settled') return false;
    let charged: number;
    if ('neverDispatched' in outcome) {
      if (request.state !== 'reserved') return false;
      charged = 0;
    } else {
      if (request.state !== 'dispatched') return false;
      if ('actualMicros' in outcome && (!Number.isSafeInteger(outcome.actualMicros) || outcome.actualMicros < 0)) return false;
      charged = 'actualMicros' in outcome ? outcome.actualMicros : request.maximumMicros;
      // A provider overrun is recorded honestly and locks future requests; never clamp away real cost.
    }
    const budget = this.state.windows.get(request.window)!;
    budget.held -= request.maximumMicros;
    budget.spent += charged;
    if (charged > request.maximumMicros) budget.blocked = true;
    request.state = 'settled';
    request.chargedMicros = charged;
    return true;
  }
}
