import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createElement, useMemo } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ServicesProvider, type AppServices } from '../../src/app/services';
import { Repositories } from '../../src/data/repositories';
import { TABLES } from '../../src/data/schema';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { SPEECH_PROBE_KEY, type OnDeviceAnswer } from '../../src/domain/talk';
import { getSpeechProbe } from '../../src/services/talkService';
import { useChildSpeechProbe } from '../../src/ui/child/ChildMode';
import { MicButton, MIC_NEEDS_GROWNUP, type Mic } from '../../src/ui/child/Talk';
import { BrowserSpeechInput, type SpeechInput } from '../../src/voice/SpeechService';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Chrome/142.0 Synthetic' } });
Object.assign(globalThis, {
  window: {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
  },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function harness(t: TestContext, input: SpeechInput) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const db = new MemoryDatabase(TABLES);
  const repos = new Repositories(db);
  const ctx = { repos, clock: { now: () => new Date('2026-06-01T12:00:00Z') }, ids: () => 'synthetic' };
  const services = { db, ctx, speechIn: input } as unknown as AppServices;
  const heard: string[] = [];
  let current!: ReturnType<typeof useChildSpeechProbe>;
  function Harness() {
    current = useChildSpeechProbe('device');
    const { known, knownRef, modeRef, prepare } = current;
    const mic = useMemo<Mic>(() => {
      const availability = input.check('device', known);
      return {
        onDevice: availability.onDevice,
        needsSetup: ['unknown', 'downloadable', 'downloading'].includes(known),
        blocked: availability.state === 'unsupported' ? MIC_NEEDS_GROWNUP : null,
        prepare,
        listen: (options) => input.listen(modeRef.current, knownRef.current, options),
        stop: () => input.stop(),
      };
    }, [known, knownRef, modeRef, prepare]);
    return createElement(MicButton, { mic, label: 'Synthetic microphone', onHeard: (text) => heard.push(text) });
  }
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(ServicesProvider, { services, children: createElement(Harness) }));
  });
  t.after(async () => {
    await act(async () => tree.unmount());
  });
  return {
    ctx,
    repos,
    heard,
    tree,
    current: () => current,
    click: () =>
      act(async () => {
        tree.root.findByType('button').props.onClick();
      }),
    queryTick: () =>
      act(async () => {
        t.mock.timers.tick(20);
      }),
  };
}

test('actual child probe and MicButton keep the sentence for the current listen across stale enumeration', async (t) => {
  const available = deferred<'available'>();
  const enumerations: ReturnType<typeof deferred<MediaDeviceInfo[]>>[] = [];
  const queue = ['Synthetic queued sentence'];
  let probes = 0;
  let installs = 0;
  let starts = 0;
  class Recognition {
    static available = () => (++probes === 1 ? Promise.resolve('downloadable') : available.promise);
    static install = async () => {
      installs++;
      return true;
    };
    onresult: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    start() {
      starts++;
      const text = queue.shift();
      if (text) this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true })] });
      this.onend?.();
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
  }
  const input = new BrowserSpeechInput({
    SpeechRecognition: Recognition,
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
    navigator: {
      mediaDevices: {
        enumerateDevices: () => {
          const next = deferred<MediaDeviceInfo[]>();
          enumerations.push(next);
          return next.promise;
        },
      },
    },
  } as unknown as Window);
  const h = await harness(t, input);
  await h.click();
  await h.queryTick();
  assert.equal(probes, 2);
  assert.equal(installs, 1);
  assert.equal((await getSpeechProbe(h.ctx))?.answer, 'pending');
  await act(async () => available.resolve('available'));
  assert.equal(h.current().known, 'available', 'local completion wins before the delayed query refresh');
  assert.equal(h.current().knownRef.current, 'available');
  assert.equal(h.tree.root.findByType(MicButton).props.mic.blocked, null);
  assert.equal(h.tree.root.findByType('button').props['aria-busy'], false);
  assert.equal(h.tree.root.findByType('button').props['aria-pressed'], false);
  assert.equal(enumerations.length, 1, 'obsolete setup listen is suspended inside enumeration');
  await h.click();
  assert.equal(enumerations.length, 2);
  await act(async () => enumerations[0]!.resolve([]));
  assert.deepEqual(queue, ['Synthetic queued sentence']);
  assert.equal(starts, 0, 'canceled setup must not steal the sentence');
  await act(async () => enumerations[1]!.resolve([]));
  assert.deepEqual(h.heard, ['Synthetic queued sentence']);
  assert.equal(starts, 1);
  await h.queryTick();
  assert.equal(h.current().known, 'available');
  assert.equal((await getSpeechProbe(h.ctx))?.answer, 'available');
});

test('completed probe survives delayed pending/unknown queries and later explicit unsupported/error replaces it', async (t) => {
  const answer = deferred<OnDeviceAnswer>();
  const input = new BrowserSpeechInput({
    SpeechRecognition: class {
      static available = async () => 'available';
    },
    setTimeout,
    clearTimeout,
  } as unknown as Window);
  input.probe = () => answer.promise;
  const h = await harness(t, input);
  let preparing!: ReturnType<ReturnType<typeof useChildSpeechProbe>['prepare']>;
  await act(async () => {
    preparing = h.current().prepare();
  });
  await h.queryTick();
  await act(async () => answer.resolve('available'));
  assert.equal(await preparing, 'ready');
  assert.equal(h.current().known, 'available');
  // Deliver deliberately stale rows through the real subscription; no extra probe is run.
  for (const value of [{ answer: 'pending', browser: 'Chrome', at: '2026-06-01T11:59:00Z' }, undefined]) {
    await act(async () => {
      await h.repos.meta.put({ key: SPEECH_PROBE_KEY, value });
    });
    await h.queryTick();
    assert.equal(h.current().known, 'available');
    assert.equal(h.current().knownRef.current, 'available');
  }
  input.probe = async () => 'unavailable';
  await act(async () => {
    assert.equal(await h.current().prepare(), 'unsupported');
  });
  assert.equal(h.current().known, 'unavailable');
  assert.equal(h.current().knownRef.current, 'unavailable');
  input.probe = async () => 'available';
  await act(async () => {
    assert.equal(await h.current().prepare(), 'ready');
  });
  assert.equal(h.current().known, 'available');
  input.probe = async () => {
    throw new Error('Synthetic probe failure');
  };
  await act(async () => {
    assert.equal(await h.current().prepare(), 'unsupported');
  });
  assert.equal(h.current().known, 'unavailable');
  assert.equal(h.current().knownRef.current, 'unavailable');
});
