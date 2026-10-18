import { isTeacherAvailable } from '../../src/domain/teachers/registry';
/** The final merged candidate must preserve seating, Milo, and parent arithmetic/privacy together. */
import { writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type TestInfo } from 'playwright/test';
import type * as THREE from 'three';
import { CHILD_SCOPED_TABLES, DB_NAME } from '../../src/data/schema';
import type { Child, Evidence, Household, LessonAttempt, TeacherInteraction } from '../../src/domain/types';
import type { SeatAnchor } from '../../src/engine/world/seats';
import type { InteractableDef } from '../../src/engine/world/types';
import { APP, enterSchool, unlockParent } from './helpers';
import { loadBookSample } from './fixtures/book-arrival';

type ReleaseGame = {
  busy: boolean;
  seated: boolean;
  pendingSeat: string | null;
  teleport(x: number, z: number): void;
  teleportTo(id: string): void;
  renderer: { info: { render: { frame: number; calls: number }; memory: { geometries: number; textures: number } } };
  renderSuspensions: Set<symbol>;
  scene: THREE.Scene;
  input: { enabled: boolean };
  tweens: { wait(seconds: number): Promise<void> };
  avatar: { root: THREE.Group; seatedPose: string | null };
  player: {
    position: THREE.Vector3;
    seated: SeatAnchor | null;
    isWalkingPath: boolean;
    nav: { findPath(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] | null };
  };
  interaction: {
    markers: Map<string, { sprite: THREE.Sprite }>;
    pick(point: THREE.Vector2, camera: THREE.PerspectiveCamera): InteractableDef | null;
    pickFloor(point: THREE.Vector2, camera: THREE.PerspectiveCamera): THREE.Vector3 | null;
  };
  rig: { camera: THREE.PerspectiveCamera; yaw: number; pitch: number; distance: number; inCinematic: boolean; snapTo(position: THREE.Vector3): void };
  world: {
    currentState: unknown;
    interactables: InteractableDef[];
    structure: { collisions: { blocked(x: number, z: number, radius: number): boolean } };
  };
};

type SavedRecords = Record<string, unknown[]> & { lessonAttempts: LessonAttempt[]; evidence: Evidence[]; teacherInteractions: TeacherInteraction[] };

test.use({ actionTimeout: 45_000 });
test.setTimeout(720_000);

async function records(page: Page): Promise<SavedRecords> {
  return page.evaluate(
    async ({ name, tables }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const rows = await Promise.all(
          tables.map(
            (table) =>
              new Promise<[string, unknown[]]>((resolve, reject) => {
                const request = db.transaction(table).objectStore(table).getAll();
                request.onsuccess = () => resolve([table, request.result]);
                request.onerror = () => reject(request.error);
              }),
          ),
        );
        return Object.fromEntries(rows) as SavedRecords;
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, tables: CHILD_SCOPED_TABLES },
  );
}

async function state(page: Page) {
  return page.evaluate(() => {
    const game = window.__izzy?.game() as unknown as ReleaseGame | null;
    if (!game) return null;
    let sceneObjects = 0;
    game.scene.traverse(() => sceneObjects++);
    return {
      frame: game.renderer.info.render.frame,
      renderCalls: game.renderer.info.render.calls,
      rendererMemory: game.renderer.info.memory,
      renderLeases: game.renderSuspensions.size,
      sceneObjects,
      inputEnabled: game.input.enabled,
      busy: game.busy,
      cinematic: game.rig.inCinematic,
      overlay: window.__izzy!.overlay(),
      performing: window.__izzy!.performing(),
      seated: game.seated,
      seatId: game.world.interactables.find((item) => item.seat && item.seat === game.player.seated)?.id ?? null,
      pendingSeat: game.pendingSeat,
      seatedPose: game.avatar.seatedPose,
      bookVisible: game.avatar.root.getObjectByName('seated-open-book')!.visible,
      position: game.player.position.toArray(),
      walking: game.player.isWalkingPath,
      blocked: game.world.structure.collisions.blocked(game.player.position.x, game.player.position.z, 0.3),
      world: game.world.currentState,
      seats: game.world.interactables.filter((item) => item.seat).map((item) => ({ id: item.id, enabled: item.enabled })),
    };
  });
}

async function checkpoint(page: Page, info: TestInfo, name: string) {
  const evidence = {
    checkpoint: name,
    project: info.project.name,
    viewport: page.viewportSize(),
    candidateHead: process.env.RELEASE_HEAD_SHA ?? 'local-collection-only-unless-browser-executed',
    scene: await state(page),
    savedRecords: await records(page),
  };
  const json = info.outputPath(`${name}.json`);
  writeFileSync(json, JSON.stringify(evidence, null, 2));
  await info.attach(name, { path: json, contentType: 'application/json' });
  const screenshot = info.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await info.attach(name, { path: screenshot, contentType: 'image/png' });
  return evidence;
}

async function renderedFrames(page: Page, count = 2) {
  const frame = (await state(page))!.frame;
  await page.waitForFunction(
    ({ frame, count }) => (window.__izzy!.game() as unknown as ReleaseGame).renderer.info.render.frame >= frame + count,
    { frame, count },
    { timeout: 90_000 },
  );
}

async function playable(page: Page) {
  await expect(page.getByTestId('child-mode')).toHaveClass(/\bready\b/, { timeout: 300_000 });
  await page.waitForFunction(
    () => {
      const game = window.__izzy?.game() as unknown as ReleaseGame | null;
      return (
        game &&
        !game.busy &&
        !game.rig.inCinematic &&
        game.input.enabled &&
        !game.renderSuspensions.size &&
        !window.__izzy!.overlay() &&
        !window.__izzy!.performing()
      );
    },
    null,
    { timeout: 120_000 },
  );
}

async function activate(button: Locator, mobile: boolean) {
  await expect(button).toBeEnabled();
  if (mobile) await button.tap();
  else await button.click();
}

/** Relocation only prepares an approach. The seat is picked by real canvas mouse/touch input. */
async function sit(page: Page, id: string, mobile: boolean) {
  await playable(page);
  await page.evaluate((id) => {
    const game = window.__izzy!.game() as unknown as ReleaseGame;
    const seat = game.world.interactables.find((item) => item.id === id)!.seat!;
    const start = seat.exit.clone().add(seat.exit.clone().sub(seat.position).setY(0).normalize().multiplyScalar(0.6));
    const blocked = game.world.structure.collisions.blocked(start.x, start.z, 0.3);
    game.teleport(blocked ? seat.exit.x : start.x, blocked ? seat.exit.z : start.z);
    game.rig.yaw = seat.yaw + 0.3;
    game.rig.pitch = 0.65;
    game.rig.distance = 9;
    game.rig.snapTo(game.player.position);
  }, id);
  await renderedFrames(page);
  const target = await page.evaluate((id) => {
    const game = window.__izzy!.game() as unknown as ReleaseGame;
    const marker = game.interaction.markers.get(id)!.sprite;
    const point = marker.position.clone().project(game.rig.camera);
    const canvas = document.querySelector('canvas.game-canvas')!;
    const bounds = canvas.getBoundingClientRect();
    const x = bounds.left + ((point.x + 1) * bounds.width) / 2;
    const y = bounds.top + ((1 - point.y) * bounds.height) / 2;
    return {
      x,
      y,
      visible: marker.visible,
      onCanvas: document.elementFromPoint(x, y) === canvas,
      picked: game.interaction.pick(point as unknown as THREE.Vector2, game.rig.camera)?.id,
    };
  }, id);
  expect(target.visible).toBe(true);
  expect(target.onCanvas).toBe(true);
  expect(target.picked).toBe(id);
  if (mobile) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await expect.poll(async () => (await state(page))!.seatId, { timeout: 90_000 }).toBe(id);
  await expect(page.getByTestId('interact-prompt')).toContainText('Stand up');
  await renderedFrames(page);
  const seated = (await state(page))!;
  expect(seated.seatedPose).toBe(id === 'seat-nook-couch' ? 'read' : 'sit');
  expect(seated.bookVisible).toBe(id === 'seat-nook-couch');
  expect(seated.walking).toBe(false);
  expect(seated.renderLeases).toBe(0);
}

async function stand(page: Page, mobile: boolean) {
  await activate(page.getByTestId('interact-prompt'), mobile);
  await expect.poll(async () => (await state(page))!.seated).toBe(false);
  const standing = (await state(page))!;
  expect(standing.pendingSeat).toBeNull();
  expect(standing.seatedPose).toBeNull();
  expect(standing.bookVisible).toBe(false);
  expect(standing.blocked).toBe(false);
  await playable(page);
}

/** Real floor input must move the character after Milo has released its draw lease. */
async function moveByFloor(page: Page, info: TestInfo, mobile: boolean) {
  await playable(page);
  await renderedFrames(page);
  const target = await page.evaluate(() => {
    const game = window.__izzy!.game() as unknown as ReleaseGame;
    const canvas = document.querySelector('canvas.game-canvas')!;
    const bounds = canvas.getBoundingClientRect();
    for (const ny of [-0.4, -0.55, -0.7, -0.25, -0.1]) {
      for (const nx of [-0.6, 0.6, -0.4, 0.4, -0.8, 0.8, 0]) {
        const point = game.player.position.clone().set(nx, ny, 0) as unknown as THREE.Vector2;
        const floor = game.interaction.pickFloor(point, game.rig.camera);
        const x = bounds.left + ((nx + 1) * bounds.width) / 2;
        const y = bounds.top + ((1 - ny) * bounds.height) / 2;
        const distance = floor?.distanceTo(game.player.position) ?? 0;
        if (
          !floor ||
          distance < 0.8 ||
          distance > 4 ||
          game.world.structure.collisions.blocked(floor.x, floor.z, 0.32) ||
          game.interaction.pick(point, game.rig.camera) ||
          document.elementFromPoint(x, y) !== canvas
        )
          continue;
        // A clear ray can still land in a disconnected floor pocket or on a snapped goal.
        // Keep the normal pathfinder and require this exact target to be reachable.
        const path = game.player.nav.findPath(game.player.position, floor);
        const end = path?.at(-1);
        if (!end || Math.hypot(end.x - floor.x, end.z - floor.z) > 0.1) continue;
        return { x, y, floorX: floor.x, floorZ: floor.z, from: game.player.position.toArray() };
      }
    }
    return null;
  });
  expect(target, 'an unobstructed nearby floor target remains reachable').not.toBeNull();
  if (mobile) await page.touchscreen.tap(target!.x, target!.y);
  else await page.mouse.click(target!.x, target!.y);
  await expect
    .poll(
      () =>
        page.evaluate(({ floorX, floorZ }) => {
          const game = window.__izzy!.game() as unknown as ReleaseGame;
          return Math.hypot(game.player.position.x - floorX, game.player.position.z - floorZ);
        }, target!),
      { timeout: 90_000 },
    )
    .toBeLessThan(0.35);
  await expect.poll(async () => (await state(page))!.walking).toBe(false);
  const final = await state(page);
  const displacement = Math.hypot(final!.position[0]! - target!.from[0]!, final!.position[2]! - target!.from[2]!);
  expect(displacement).toBeGreaterThan(0.4);
  const evidence = info.outputPath('real-floor-navigation.json');
  writeFileSync(
    evidence,
    JSON.stringify(
      {
        target,
        final,
        distanceToTarget: Math.hypot(final!.position[0]! - target!.floorX, final!.position[2]! - target!.floorZ),
        displacement,
      },
      null,
      2,
    ),
  );
  await info.attach('Real floor navigation after Milo', { path: evidence, contentType: 'application/json' });
}

async function openTeacher(page: Page, id: 'milo' | 'digit', mobile: boolean) {
  await playable(page);
  await page.evaluate((id) => {
    const game = window.__izzy!.game() as unknown as ReleaseGame;
    game.teleportTo(id);
    game.rig.snapTo(game.player.position);
  }, id);
  await renderedFrames(page);
  await expect(page.getByTestId('interact-prompt')).toContainText(id === 'milo' ? 'Milo' : 'Digit');
  await activate(page.getByTestId('interact-prompt'), mobile);
}

async function configureFixture(page: Page, aiEnabled: boolean) {
  await page.evaluate(
    async ({ name, aiEnabled }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['children', 'households'], 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
          const children = tx.objectStore('children');
          const kids = children.getAll();
          kids.onsuccess = () => {
            for (const child of kids.result as Child[]) {
              const { birthDate: _birthDate, sayName: _sayName, ...sample } = child;
              children.put({ ...sample, explored: ['milo', 'digit', 'nova', 'pippa', 'hoot', 'tavi'], isDemo: true });
            }
          };
          const households = tx.objectStore('households');
          const settings = households.getAll();
          settings.onsuccess = () => {
            for (const household of settings.result as Household[])
              households.put({
                ...household,
                name: 'Synthetic combined candidate',
                settings: {
                  ...household.settings,
                  talkMode: 'off',
                  readAloud: false,
                  audio: { ...household.settings.audio, muted: true },
                  teacherAi: { enabled: aiEnabled, consentToSend: aiEnabled, endpoint: '/api', naturalVoices: false },
                },
              });
          };
        });
      } finally {
        db.close();
      }
    },
    { name: DB_NAME, aiEnabled },
  );
}

async function answer(page: Page) {
  const equation = await page.locator('.arithmetic-equation').textContent();
  const match = /(\d+)\s*([+−])\s*(\d+)/.exec(equation!)!;
  return String(match[2] === '+' ? Number(match[1]) + Number(match[3]) : Number(match[1]) - Number(match[3]));
}

async function parentPrivacy(page: Page, enabled: boolean) {
  await expect(page.getByRole('heading', { name: 'Teacher talk', exact: true })).toBeVisible();
  await expect(page.locator('.page-sub')).toContainText('Saved conversations and activity summaries for Sample');
  await expect(page.locator('.page-sub')).toContainText('Some activities save summaries rather than every line');
  const notice = page.getByTestId('conversation-privacy');
  await expect(notice).toContainText(`Optional AI chat: ${enabled ? 'on' : 'off'}`);
  for (const text of [
    'stored in this browser',
    'family sync when enabled, or in exports you make',
    'Voice and microphone sharing are controlled separately',
    'may send text or audio to other services',
  ])
    await expect(notice).toContainText(text);
  if (enabled)
    for (const text of ['helper and its AI service receive text', 'first name', 'current message', 'recent conversation turns', 'book titles'])
      await expect(notice).toContainText(text);
  else await expect(notice).toContainText('Built-in chat replies run on this device');
  await expect(page.locator('.page')).not.toContainText(/Stored only on this device|nothing is sent anywhere|word for word|every conversation/i);
}

async function arithmeticCard(page: Page, run: LessonAttempt, mobile: boolean) {
  const card = page.locator('.convo').filter({ hasText: '1 model-only (ungraded)' });
  await expect(card).toHaveCount(1);
  await card.locator('.convo-head').click();
  await expect(card.locator('.convo-head')).toHaveAttribute('aria-expanded', 'true');
  const detail = card.locator('.lesson-detail');
  await expect(detail.getByRole('columnheader')).toHaveCount(5);
  await expect(detail.locator('tbody tr')).toHaveCount(4);
  for (const [index, problem] of run.problems.entries())
    await expect(detail.locator('tbody tr').nth(index).locator('[data-label="Prompt"]')).toHaveText(problem.prompt);
  await expect(detail).not.toContainText('Identify tens and ones');
  await expect(detail.getByText('Viewed model · ungraded', { exact: true })).toBeVisible();
  await expect(detail.getByText('No answer attempted', { exact: true })).toHaveCount(2);
  for (const label of ['Prompt', 'Skill', 'Answers', 'Help given', 'Result']) await expect(detail.locator(`[data-label="${label}"]`)).toHaveCount(4);
  expect(
    await detail
      .locator('tbody td')
      .first()
      .evaluate((element) => getComputedStyle(element).display),
  ).toBe(mobile ? 'block' : 'table-cell');
  if (mobile) {
    for (const cell of await detail.locator('tbody tr').first().locator('td').all()) {
      const geometry = await cell.evaluate((element) => ({
        label: getComputedStyle(element, '::before').content,
        expected: element.getAttribute('data-label'),
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      }));
      expect(geometry.label).toBe(`"${geometry.expected}"`);
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await detail.scrollIntoViewIfNeeded();
}

test('seat → leave → available teacher → restored movement → another seat; exact arithmetic cards retain privacy copy', async ({
  page,
  isMobile,
  baseURL,
}, info) => {
  const unexpectedRequests: string[] = [];
  const errors: string[] = [];
  let microphoneAttempts = 0;
  await page.exposeFunction('combinedMicrophoneAttempt', () => microphoneAttempts++);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL!).origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.origin === new URL(baseURL!).origin && url.pathname === '/api/health')
      return route.fulfill({ json: { ok: true, keyConfigured: false, provider: 'mock-only', voices: false, listening: false } });
    unexpectedRequests.push(url.href);
    return route.abort();
  });
  await page.routeWebSocket('**/*', (socket) => {
    unexpectedRequests.push(socket.url());
    socket.close();
  });
  await page.addInitScript(() => {
    const fixture = window as unknown as Window & { combinedMicrophoneAttempt(): Promise<void> };
    navigator.mediaDevices.getUserMedia = async () => {
      await fixture.combinedMicrophoneAttempt();
      throw new Error('No microphone in the synthetic combined release journey');
    };
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() {},
        addEventListener() {},
        removeEventListener() {},
        speak() {
          throw new Error('No provider speech in the synthetic combined release journey');
        },
      },
    });
  });
  try {
    await loadBookSample(page, 25);
    await configureFixture(page, false);
    await enterSchool(page, 'sample');
    await playable(page);
    let before = await records(page);
    await checkpoint(page, info, '01-ready-before-seating');
    await sit(page, 'seat-nook-couch', isMobile);
    await checkpoint(page, info, '02-reading-seat');
    await stand(page, isMobile);
    expect(await records(page)).toEqual(before);
    await checkpoint(page, info, '03-left-seat');

    // Both dismissal paths must release exactly the owned draw lease, on the same world.
    for (const dismissal of ['close', 'escape'] as const) {
      if (!isTeacherAvailable('milo')) {
        await openTeacher(page, 'digit', isMobile);
        await expect(page.getByRole('dialog', { name: 'Talking with Digit' })).toBeVisible();
        if (dismissal === 'close') await activate(page.getByTestId('dialogue-close'), isMobile);
        else await page.getByTestId('dialogue-close').press('Escape');
        await playable(page);
        expect((await state(page))!.renderLeases).toBe(0);
        await checkpoint(page, info, `05-digit-${dismissal}-restored-world`);
        continue;
      }
      await openTeacher(page, 'milo', isMobile);
      await expect(page.getByTestId('rhythm-flow')).toBeVisible();
      await expect.poll(async () => (await state(page))!.renderLeases).toBe(1);
      const paused = (await state(page))!;
      expect(paused.inputEnabled).toBe(false);
      expect(paused.seated).toBe(false);
      await activate(page.getByRole('button', { name: 'Choose matching pictures', exact: true }), isMobile);
      // Advancing a real world tween proves updates remain live while rendering is suspended.
      await page.evaluate(async () => (window.__izzy!.game() as unknown as ReleaseGame).tweens.wait(0.1));
      expect((await state(page))!.frame).toBe(paused.frame);
      await checkpoint(page, info, `04-milo-${dismissal}-owns-render-lease`);
      if (dismissal === 'close') await activate(page.getByRole('button', { name: 'Close without saving', exact: true }), isMobile);
      else {
        await page.getByRole('button', { name: 'Close without saving', exact: true }).focus();
        await page.keyboard.press('Escape');
      }
      await expect(page.getByTestId('rhythm-flow')).toHaveCount(0);
      await playable(page);
      await renderedFrames(page);
      expect((await state(page))!.frame).toBeGreaterThan(paused.frame);
      expect((await state(page))!.renderLeases).toBe(0);
      await checkpoint(page, info, `05-milo-${dismissal}-restored-world`);
    }
    if (!isTeacherAvailable('milo')) before = await records(page);
    await moveByFloor(page, info, isMobile);
    await checkpoint(page, info, '06-real-floor-movement-restored');
    await sit(page, 'seat-table-1-1', isMobile);
    await checkpoint(page, info, '07-another-seat-works');
    await stand(page, isMobile);
    expect(await records(page)).toEqual(before);

    // A neighboring same-teacher lesson is intentionally saved first: temporal matching is wrong.
    await openTeacher(page, 'digit', isMobile);
    await activate(page.getByTestId('choose-teacher-activity'), isMobile);
    await activate(page.getByTestId('choice-base-ten-mission'), isMobile);
    await activate(page.getByTestId('choice-start'), isMobile);
    await activate(page.getByRole('button', { name: 'Skip this round', exact: true }), isMobile);
    await activate(page.getByTestId('dialogue-close'), isMobile);
    const neighboring = (await records(page)).lessonAttempts.filter((run) => run.lessonId === 'base-ten-mission');
    expect(neighboring).toHaveLength(1);
    await openTeacher(page, 'digit', isMobile);
    await activate(page.getByTestId('choose-teacher-activity'), isMobile);
    await activate(page.getByTestId('choice-base-ten-arithmetic'), isMobile);
    await activate(page.getByRole('button', { name: 'Grown-up: choose challenge', exact: true }), isMobile);
    await unlockParent(page);
    await page.getByRole('combobox', { name: 'Practice purpose', exact: true }).selectOption('learning');
    await activate(page.getByTestId('choice-1'), isMobile);
    await activate(page.getByRole('button', { name: 'See the taking-away example next', exact: true }), isMobile);
    await activate(page.getByRole('button', { name: 'Try four fresh problems', exact: true }), isMobile);
    await activate(page.getByRole('button', { name: 'Work it out together', exact: true }), isMobile);
    await activate(page.getByRole('button', { name: 'Try a fresh problem', exact: true }), isMobile);
    await activate(page.getByTestId(`choice-${await answer(page)}`), isMobile);
    await activate(page.getByRole('button', { name: 'Try a fresh problem', exact: true }), isMobile);
    await activate(page.getByRole('button', { name: 'Show a hint', exact: true }), isMobile);
    await activate(page.getByTestId(`choice-${await answer(page)}`), isMobile);
    await activate(page.getByRole('button', { name: 'Try a fresh problem', exact: true }), isMobile);
    await activate(page.getByRole('button', { name: 'Skip this round', exact: true }), isMobile);
    await activate(page.getByRole('button', { name: 'Finish mission', exact: true }), isMobile);
    const saved = await records(page);
    const arithmetic = saved.lessonAttempts.filter((run) => run.lessonId === 'base-ten-arithmetic');
    expect(arithmetic).toHaveLength(1);
    const run = arithmetic[0]!;
    expect(run.complete).toBe(true);
    expect(run.problems.map((problem) => problem.outcome)).toEqual(['model_only', 'independent', 'supported', 'skipped']);
    expect(saved.evidence.filter((item) => item.source.id === run.id)).toHaveLength(2);
    expect(saved.teacherInteractions.filter((item) => item.id === `${run.id}:talk`)).toHaveLength(1);
    await checkpoint(page, info, '08-exact-arithmetic-run-saved');

    await page.goto(`${APP}#/parent/conversations`);
    await unlockParent(page);
    await parentPrivacy(page, false);
    await arithmeticCard(page, run, isMobile);
    await checkpoint(page, info, '09-parent-privacy-off-exact-run');
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 812 });
      // Keep the same expanded record: labels and content must remain contained at narrow width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator('.lesson-detail [data-label="Prompt"]').first()).toBeVisible();
      await checkpoint(page, info, '10-parent-narrow-responsive-cards');
      await page.setViewportSize(info.project.use.viewport!);
    }
    await configureFixture(page, true);
    await page.reload();
    await parentPrivacy(page, true);
    await arithmeticCard(page, run, isMobile);
    expect(await records(page)).toEqual(saved);
    await checkpoint(page, info, '11-parent-privacy-on-exact-run');
    expect(microphoneAttempts).toBe(0);
    expect(unexpectedRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    const safety = info.outputPath('synthetic-safety.json');
    writeFileSync(safety, JSON.stringify({ microphoneAttempts, unexpectedRequests, pageErrors: errors }, null, 2));
    await info.attach('Synthetic transport and microphone guard', { path: safety, contentType: 'application/json' });
  }
});
