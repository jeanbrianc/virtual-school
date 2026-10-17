import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Game } from '../../src/engine/Game';
import { RhythmFlow } from '../../src/ui/child/flows/RhythmFlow';

const listeners = new Map<string, () => void>();
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: { addEventListener: (key: string, fn: () => void) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) },
  document: {
    hidden: false,
    addEventListener: (key: string, fn: () => void) => listeners.set(key, fn),
    removeEventListener: (key: string) => listeners.delete(key),
  },
});

test('draw leases preserve other owners and idempotent cleanup restores both render paths', () => {
  let plain = 0,
    composed = 0;
  // Exercise the production draw boundary without constructing a WebGL context.
  const game = Object.assign(Object.create(Game.prototype) as object, {
    renderSuspensions: new Set<symbol>(),
    renderer: { render: () => plain++ },
    composer: null,
    scene: {},
    rig: { camera: {} },
  }) as unknown as Game;
  const internal = game as unknown as { drawFrame(dt: number): void; composer: null | { render(dt: number): void } };
  internal.drawFrame(0.1);
  assert.equal(plain, 1);
  const priorOwner = game.suspendRendering();
  const rhythmOwner = game.suspendRendering();
  internal.drawFrame(0.1);
  assert.equal(plain, 1);
  rhythmOwner();
  rhythmOwner();
  internal.drawFrame(0.1);
  assert.equal(plain, 1, 'one activity cannot release a different owner');
  priorOwner();
  internal.drawFrame(0.1);
  assert.equal(plain, 2);
  internal.composer = { render: () => composed++ };
  const stop = game.suspendRendering();
  internal.drawFrame(0.1);
  assert.equal(composed, 0);
  stop();
  internal.drawFrame(0.1);
  assert.equal(composed, 1);
});

test('RhythmFlow owns exactly one draw lease across StrictMode, visibility, child/teacher switch and unmount', async () => {
  const owners = new Set<symbol>();
  let acquired = 0,
    closes = 0;
  const suspendBackground = () => {
    acquired++;
    const owner = Symbol();
    owners.add(owner);
    return () => {
      owners.delete(owner);
    };
  };
  const view = (childId: string, teacher = 'milo') =>
    createElement(
      StrictMode,
      null,
      teacher === 'milo'
        ? createElement(RhythmFlow, {
            key: childId,
            childId,
            muted: true,
            volume: 0,
            suspendBackground,
            onSave: async () => {},
            onClose: () => closes++,
          })
        : createElement('div', null, 'Another teacher'),
    );
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(view('sample'));
  });
  assert.ok(acquired >= 2, 'StrictMode setup/cleanup/setup is exercised');
  assert.equal(owners.size, 1);
  const click = async (label: string) => {
    const button = tree.root.findAllByType('button').find((b) => b.props.children === label)!;
    await act(async () => button.props.onClick());
  };
  await click('Tap a rhythm');
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  await act(async () => listeners.get('visibilitychange')!());
  assert.equal(owners.size, 1, 'hidden/visible pauses the task, not ownership');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  await click('Resume rhythm');
  assert.equal(owners.size, 1);
  await act(async () => tree.update(view('sample sibling')));
  assert.equal(owners.size, 1, 'child switch releases the old owner');
  await click('Close without saving');
  assert.equal(closes, 1);
  await act(async () => tree.update(view('sample sibling', 'nova')));
  assert.equal(owners.size, 0, 'close or another teacher restores draws');
  await act(async () => tree.update(view('sample')));
  assert.equal(owners.size, 1);
  await act(async () => tree.unmount());
  assert.equal(owners.size, 0, 'route/unmount releases the last owner');
});
