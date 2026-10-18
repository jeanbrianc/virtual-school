import { expect, test, type Page, type BrowserContext, type TestInfo } from 'playwright/test';
import type { PerspectiveCamera, Vector3 } from 'three';
import { DB_NAME } from '../../../src/data/schema';
import { isTeacherAvailable, TEACHER_REGISTRY } from '../../../src/domain/teachers/registry';
import type { Evidence, LessonAttempt, TeacherInteraction } from '../../../src/domain/types';
import { APP, talkTo, unlockParent } from '../helpers';
import { captureSyntheticSuccess } from '../synthetic-household';
import { loadRoutineSample } from './routineSample';

type Scene = {
  busy: boolean;
  availableInteractables(): string[];
  interactById(id: string): void;
  player: { position: Vector3; isWalkingPath: boolean };
  rig: { yaw: number; camera: PerspectiveCamera; inCinematic: boolean; snapTo(position: Vector3): void };
  renderer: { info: { render: { frame: number } } };
  world: { teachers: Map<string, unknown>; anchors: Map<string, unknown>; interactables: { id: string }[] };
  interaction: { byId(id: string): unknown; pick(point: Vector3, camera: PerspectiveCamera): { id: string } | null };
};

async function savedState(page: Page) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await Promise.all(
        ['children', 'lessonAttempts', 'teacherInteractions', 'evidence'].map(
          (table) =>
            new Promise<unknown[]>((resolve, reject) => {
              const r = db.transaction(table).objectStore(table).getAll();
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => reject(r.error);
            }),
        ),
      );
    } finally {
      db.close();
    }
  }, DB_NAME);
}

/** Current hidden default runs real assertions; dormant flow scenarios remain available for restoration. */
export function hiddenTeacherTests(id: 'milo' | 'tavi') {
  test(`${id} is absent from the scene, direct routes and discovery; former position accepts real floor input`, async ({ page }, info) => {
    await loadRoutineSample(page);
    const before = await savedState(page);
    const explored = await page.evaluate(() => window.__izzy!.explored());
    const state = await page.evaluate(() => {
      const game = window.__izzy!.game() as unknown as Scene;
      return {
        teachers: [...game.world.teachers.keys()],
        available: game.availableInteractables(),
        definitions: game.world.interactables.map((entry) => entry.id),
        hidden: ['milo', 'tavi'].map((teacher) => ({
          teacher,
          interaction: !!game.interaction.byId(teacher),
          anchor: game.world.anchors.has(`teacher:${teacher}`),
        })),
      };
    });
    expect(state.teachers).toEqual(['hoot', 'digit', 'pippa', 'nova']);
    for (const hidden of ['milo', 'tavi']) {
      expect(state.available).not.toContain(hidden);
      expect(state.definitions).not.toContain(hidden);
    }
    expect(state.hidden.every((teacher) => !teacher.interaction && !teacher.anchor)).toBe(true);
    await page.evaluate((teacher) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        window.__izzy!.interact(teacher);
        (window.__izzy!.game() as unknown as Scene).interactById(teacher);
      }
    }, id);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.__izzy!.overlay())).toBeNull();
    expect(await page.evaluate(() => window.__izzy!.explored())).toEqual(explored);
    expect(await savedState(page)).toEqual(before);

    // Aim the ordinary camera at the former teacher's floor position, then use real input.
    const points =
      id === 'milo'
        ? [{ x: -4.9, z: 6.8 }, { x: -5.3, z: 3.3 }, { x: -5.3, z: 0 }, { x: -5.3, z: -3 }, { x: -5.5, z: -5.8 }, TEACHER_REGISTRY[id].scene]
        : [TEACHER_REGISTRY[id].scene];
    for (const point of points) {
      const initial = await page.evaluate(({ x, z }) => {
        const game = window.__izzy!.game() as unknown as Scene;
        game.rig.yaw = Math.atan2(game.player.position.x - x, game.player.position.z - z);
        game.rig.snapTo(game.player.position);
        return { frame: game.renderer.info.render.frame, x: game.player.position.x, z: game.player.position.z };
      }, point);
      await page.waitForFunction((frame) => (window.__izzy!.game() as unknown as Scene).renderer.info.render.frame > frame, initial.frame);
      const target = await page.evaluate(({ x, z }) => {
        const game = window.__izzy!.game() as unknown as Scene;
        const projected = game.player.position.clone().set(x, 0, z).project(game.rig.camera);
        const canvas = document.querySelector('canvas.game-canvas')!;
        const rect = canvas.getBoundingClientRect();
        const screen = { x: rect.left + ((projected.x + 1) * rect.width) / 2, y: rect.top + ((1 - projected.y) * rect.height) / 2 };
        return {
          ...screen,
          onCanvas: document.elementFromPoint(screen.x, screen.y) === canvas,
          picked: game.interaction.pick(projected, game.rig.camera)?.id ?? null,
        };
      }, point);
      expect(target.onCanvas).toBe(true);
      expect(target.picked).toBeNull();
      if (info.project.name === 'phone') await page.touchscreen.tap(target.x, target.y);
      else await page.mouse.click(target.x, target.y);
      await expect
        .poll(
          () =>
            page.evaluate(({ x, z }) => {
              const position = (window.__izzy!.game() as unknown as Scene).player.position;
              return Math.hypot(position.x - x, position.z - z);
            }, point),
          { timeout: 90_000 },
        )
        .toBeLessThan(0.5);
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await page.getByTestId('interact-prompt').allTextContents()).join(' ')).not.toMatch(/Milo|Tavi/);
    expect(await savedState(page)).toEqual(before);
    await captureSyntheticSuccess(page, info);
  });

  test(`${id} saved history survives reload while main teacher chooser and navigation remain usable`, async ({ page }, info) => {
    await loadRoutineSample(page);
    const at = '2026-06-01T12:00:00.000Z';
    const lessonId = id === 'milo' ? 'rhythm-garden' : 'everyday-sequencing';
    const lesson: LessonAttempt = {
      id: `synthetic-history-${id}`,
      childId: 'child_izzy',
      teacherId: id,
      lessonId,
      startedAt: at,
      completedAt: at,
      startTier: 0,
      endTier: 0,
      problems: [],
      summary: `Synthetic saved ${id} activity`,
      isDemo: true,
    };
    const interaction: TeacherInteraction = {
      id: `${lesson.id}:talk`,
      childId: lesson.childId,
      teacherId: id,
      startedAt: at,
      endedAt: at,
      context: { flow: 'synthetic historical activity', lessonId },
      transcript: [],
      outcome: lesson.summary,
      isDemo: true,
    };
    const evidence: Evidence = {
      id: `${lesson.id}:evidence`,
      childId: lesson.childId,
      skillId: id === 'milo' ? 'art.rhythm-copy' : 'reason.routine-constraints',
      observedAt: at,
      source: { type: 'lesson', id: lesson.id, label: lesson.summary },
      kind: 'performance',
      trials: { independent: 0, supported: 1, notYet: 0 },
      independence: 'supported',
      statement: lesson.summary,
      createdBy: 'system',
      topics: [],
      isDemo: true,
    };
    await page.evaluate(
      async ({ name, lesson, interaction, evidence }) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open(name);
          r.onsuccess = () => resolve(r.result);
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['lessonAttempts', 'teacherInteractions', 'evidence'], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore('lessonAttempts').put(lesson);
            tx.objectStore('teacherInteractions').put(interaction);
            tx.objectStore('evidence').put(evidence);
          });
        } finally {
          db.close();
        }
      },
      { name: DB_NAME, lesson, interaction, evidence },
    );
    const history = (await savedState(page)).slice(1);
    await page.reload();
    await page.waitForFunction(() => window.__izzy?.game()?.busy === false);
    expect((await savedState(page)).slice(1)).toEqual(history);
    await talkTo(page, 'nova');
    await page.getByTestId('choose-teacher-activity').click();
    const chooser = page.getByTestId('teacher-activity-chooser');
    await expect(chooser).not.toContainText(/Milo|Tavi|Beats and little pauses|What comes next/);
    await expect(page.getByTestId('choice-sink-float')).toBeVisible();
    if (info.project.name === 'phone') await page.getByTestId('dialogue-close').tap();
    else await page.getByTestId('choice-sink-float').press('Escape');
    await expect(chooser).toHaveCount(0);
    await page.getByTestId('choice-go').click();
    await expect(page.locator('.lesson-play')).toBeVisible();
    await page.getByTestId('dialogue-close').click();
    await page.goto(`${APP}#/parent/conversations`);
    await unlockParent(page);
    if (info.project.name === 'phone') await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByLabel('Viewing learner').selectOption('child_izzy');
    if (info.project.name === 'phone') {
      await page.reload();
      await expect(page.locator('.p-side')).not.toHaveClass(/\bopen\b/);
      await expect(page.getByLabel('Viewing learner')).toHaveValue('child_izzy');
    }
    await expect(page.getByText(lesson.summary, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `${id === 'milo' ? 'Milo' : 'Tavi'} (1)`, exact: true })).toBeVisible();
    expect((await savedState(page)).slice(1).map((rows) => rows.filter((row) => (row as { id: string }).id.startsWith(lesson.id)))).toEqual([
      [lesson],
      [interaction],
      [evidence],
    ]);
    await captureSyntheticSuccess(page, info);
  });
}

/** Register restored-flow scenarios only when the product explicitly exposes that teacher again. */
export function restoredTeacherTest(id: 'milo' | 'tavi') {
  return (title: string, body: (fixtures: { page: Page; context: BrowserContext }, info: TestInfo) => Promise<void>) => {
    if (isTeacherAvailable(id)) test(title, body);
  };
}
