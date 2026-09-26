import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { Repositories } from '../data/repositories';
import { DB_NAME, SCHEMA_VERSION, TABLES } from '../data/schema';
import { resetToDemo, seedDemoData } from '../data/seed/demoSeed';
import { IndexedDbDatabase } from '../data/storage/indexedDb';
import { MemoryDatabase } from '../data/storage/memory';
import type { Database } from '../data/storage/types';
import { createInterpretationService, type ActivityInterpretationService } from '../domain/interpretation';
import { LocalBookCatalogService, type BookMetadataService } from '../domain/reading/bookMetadata';
import type { Household } from '../domain/types';
import { randomIds } from '../domain/util/ids';
import { systemClock } from '../domain/util/time';
import type { ServiceContext } from '../services/context';
import { getHousehold } from '../services/householdService';
import { BrowserSpeechInput, BrowserSpeechOutput, type SpeechInput, type SpeechOutput } from '../voice/SpeechService';

/** Everything the UI needs, constructed once at startup (dependency injection root). */
export interface AppServices {
  db: Database;
  ctx: ServiceContext;
  persistent: boolean;
  audio: AudioEngine;
  speechOut: SpeechOutput;
  speechIn: SpeechInput;
  books: BookMetadataService;
  interpreter(household: Household | undefined): ActivityInterpretationService;
  resetDemo(): Promise<void>;
}

export async function createAppServices(): Promise<AppServices> {
  let db: Database;
  let persistent = true;
  try {
    db = await IndexedDbDatabase.open(DB_NAME, SCHEMA_VERSION, TABLES);
  } catch (err) {
    // Private browsing or blocked storage: keep working in-memory, and say so in the UI.
    console.warn('IndexedDB unavailable; using in-memory storage.', err);
    db = new MemoryDatabase(TABLES);
    persistent = false;
  }
  const repos = new Repositories(db);
  const ctx: ServiceContext = { repos, clock: systemClock, ids: randomIds };

  if (!(await getHousehold(ctx))) await seedDemoData(repos, systemClock);

  if (persistent && navigator.storage?.persist) {
    // Ask the browser not to evict the family's records under storage pressure.
    void navigator.storage.persist().catch(() => undefined);
  }

  const audio = new AudioEngine();
  const household = await getHousehold(ctx);
  if (household) audio.setSettings(household.settings.audio);

  return {
    db,
    ctx,
    persistent,
    audio,
    speechOut: new BrowserSpeechOutput(),
    speechIn: new BrowserSpeechInput(),
    books: new LocalBookCatalogService(),
    interpreter: (h) => createInterpretationService(h?.settings.interpretation ?? { provider: 'local', consentToSend: false }),
    resetDemo: async () => {
      await resetToDemo(repos, systemClock);
    },
  };
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices outside ServicesProvider');
  return s;
}

/**
 * Re-runs an async query whenever the database reports a write to one of the
 * given tables (or any table if omitted). Returns undefined while loading.
 */
export function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[], tables?: string[]): T | undefined {
  const { db } = useServices();
  const [value, setValue] = useState<T | undefined>(undefined);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    let cancelled = false;
    let pending: number | null = null;
    const run = () => {
      queryRef
        .current()
        .then((v) => {
          if (!cancelled) setValue(() => v);
        })
        .catch((err: unknown) => console.error('Live query failed', err));
    };
    run();
    const unsubscribe = db.subscribe((changed) => {
      if (tables && !changed.some((t) => tables.includes(t))) return;
      if (pending !== null) window.clearTimeout(pending);
      pending = window.setTimeout(run, 16);
    });
    return () => {
      cancelled = true;
      if (pending !== null) window.clearTimeout(pending);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps]);

  return value;
}

export function useHousehold(): Household | undefined {
  const { ctx } = useServices();
  return useLiveQuery(() => getHousehold(ctx), [], ['households']);
}
