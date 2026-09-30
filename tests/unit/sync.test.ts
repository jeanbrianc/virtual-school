/**
 * Family sync: change tracking on each device, the helper's sync routes, the
 * AWS store's requests, and two devices sharing one school end to end.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AwsSyncStore } from '../../scripts/ai-helper/awsStore';
import { createHelper } from '../../scripts/ai-helper/handler';
import { MemorySyncStore } from '../../scripts/ai-helper/sync';
import { Repositories } from '../../src/data/repositories';
import { SYNCED_TABLES, TABLES } from '../../src/data/schema';
import { seedDemoData } from '../../src/data/seed/demoSeed';
import { seedFreshHousehold, startFresh } from '../../src/data/seed/launch';
import { MemoryDatabase } from '../../src/data/storage/memory';
import { modClock, OUTBOX, SyncingDatabase, type OutboxEntry } from '../../src/data/storage/syncing';
import { sequentialIds } from '../../src/domain/util/ids';
import type { ServiceContext } from '../../src/services/context';
import { addMedia, updateChild } from '../../src/services/householdService';
import { addBook } from '../../src/services/readingService';
import { SyncEngine } from '../../src/sync/engine';
import { validChange, type SyncRequest, type SyncResponse, type SyncStatus } from '../../src/sync/protocol';
import type { SyncTransport } from '../../src/sync/transport';
import { mutableClock } from './helpers';

/** One device: its own database, change tracking, and services context. */
function device(name: string, iso = '2026-09-30T10:00:00.000Z') {
  const clock = mutableClock(iso);
  const inner = new MemoryDatabase(TABLES);
  const db = new SyncingDatabase(inner, name, () => clock.now().getTime());
  const repos = new Repositories(db);
  const ctx: ServiceContext = { repos, clock, ids: sequentialIds(name) };
  return { name, clock, inner, db, repos, ctx };
}

/** The family's helper, in memory, reached like /api. */
function familyHelper() {
  const store = new MemorySyncStore();
  const handle = createHelper({ syncStore: store, extraOrigins: ['https://lms.example.com'] });
  const page = { origin: 'https://lms.example.com', 'x-izzy-classroom': '1' };
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await handle({ method, path, headers: page, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return res;
  };
  const json = async (method: string, path: string, body?: unknown) => {
    const res = await call(method, path, body);
    if (res.status !== 200) throw new Error(`${res.status} ${String(res.body)}`);
    return JSON.parse(res.body as string) as unknown;
  };
  const transport: SyncTransport = {
    status: async () => (await json('GET', '/v1/sync/status')) as SyncStatus,
    sync: async (req: SyncRequest) => (await json('POST', '/v1/sync', req)) as SyncResponse,
    putMedia: async (id, blob) => {
      await json('POST', `/v1/sync/media/${id}`, { data: Buffer.from(await blob.arrayBuffer()).toString('base64'), type: blob.type || 'image/jpeg' });
    },
    getMedia: async (id) => {
      const res = await call('GET', `/v1/sync/media/${id}`);
      if (res.status !== 200) throw new Error('missing photo');
      return new Blob([(res.body as Uint8Array).slice()], { type: res.headers['Content-Type'] });
    },
  };
  return { store, handle: call, transport };
}

const engine = (d: ReturnType<typeof device>, t: SyncTransport) => new SyncEngine(d.db, d.repos, t, { now: () => d.clock.now().getTime(), timers: false });

describe('change tracking on a device', () => {
  it('stamps every write and notes it for sending — deletions too', async () => {
    const d = device('mac');
    await seedFreshHousehold(d.repos, d.clock);
    const book = await addBook(d.ctx, 'child_izzy', { title: 'Goodnight Leelanau' });
    const stored = (await d.inner.table<Record<string, unknown>>('books').get(book.id))!;
    assert.match(String(stored._mod), /^\d{13}\.\d{4}\.mac$/);
    let box = await d.db.outbox();
    assert.ok(box.some((e) => e.key === `books/${book.id}` && !e.deleted));
    assert.ok(!box.some((e) => (e.table as string) === 'meta'), 'this device’s notes are never shared');
    await d.repos.books.delete(book.id);
    box = await d.db.outbox();
    assert.ok(box.some((e) => e.key === `books/${book.id}` && e.deleted));
  });

  it('keeps stamps in time order, even within one millisecond', () => {
    const next = modClock('ipad', () => 1_790_000_000_000);
    const a = next();
    const b = next();
    assert.ok(a < b);
    assert.match(a, /^1790000000000\.0000\.ipad$/);
  });

  it('applies another device’s change only when it’s newer', async () => {
    const d = device('mac');
    await d.repos.books.put({ id: 'b1', childId: 'c', title: 'Old' } as never);
    const localMod = (await d.db.outbox())[0]!.mod;
    const older = '0000000000001.0000.phone';
    const newer = '9999999999999.0000.phone';
    assert.equal(await d.db.applyRemote([{ table: 'books', id: 'b1', mod: older, data: { id: 'b1', title: 'Older' } }]), 0);
    assert.equal(((await d.repos.books.get('b1')) as unknown as { title: string }).title, 'Old');
    assert.equal(await d.db.applyRemote([{ table: 'books', id: 'b1', mod: newer, data: { id: 'b1', title: 'Newer' } }]), 1);
    const got = (await d.inner.table<Record<string, unknown>>('books').get('b1'))!;
    assert.equal(got.title, 'Newer');
    assert.equal(got._mod, newer);
    assert.equal((await d.db.outbox()).length, 0, 'the newer remote version replaces the pending local edit');
    assert.ok(localMod < newer);
    // A photo record without its photo is held back.
    assert.equal(await d.db.applyRemote([{ table: 'media', id: 'm1', mod: newer, data: { id: 'm1', mime: 'image/jpeg' } }]), 0);
  });

  it('wiping (start fresh) deletes everywhere but keeps this device’s sync settings', async () => {
    const d = device('mac');
    await seedFreshHousehold(d.repos, d.clock);
    await addBook(d.ctx, 'child_izzy', { title: 'A' });
    await d.repos.meta.put({ key: 'sync:state', value: { enabled: true } });
    await d.repos.meta.put({ key: 'speechProbe', value: 'x' });
    await startFresh(d.repos, d.clock);
    assert.equal(await d.repos.books.count(), 0);
    const box = await d.db.outbox();
    assert.ok(
      box.some((e) => e.table === 'books' && e.deleted),
      'book tombstone',
    );
    assert.ok(
      box.some((e) => e.table === 'children' && !e.deleted),
      'children re-saved',
    );
    assert.ok(await d.repos.meta.get('sync:state'));
    assert.equal(await d.repos.meta.get('speechProbe'), undefined);
  });

  it('every sample record is valid to share', async () => {
    const d = device('demo');
    await seedDemoData(d.repos, d.clock);
    let n = 0;
    for (const e of (await d.inner.table<OutboxEntry>(OUTBOX).all()) as OutboxEntry[]) {
      const change = await d.db.changeFor(e);
      assert.ok(change, e.key);
      const { blob: _b, ...rest } = change;
      assert.ok(validChange(rest), `${e.key} is shareable`);
      n += 1;
    }
    assert.ok(n > 50);
    assert.ok(SYNCED_TABLES.every((t) => TABLES.some((s) => s.name === t)));
  });
});

describe('the helper’s sync routes', () => {
  it('keeps the newest version of each record and returns changes in order', async () => {
    const { handle, store } = familyHelper();
    const push = (mod: string, title: string) => ({ table: 'books', id: 'b1', mod, data: { id: 'b1', title } });
    const post = async (body: unknown) => JSON.parse((await handle('POST', '/v1/sync', body)).body as string) as SyncResponse;
    assert.equal((await post({ push: [push('1790000000000.0000.mac', 'A')], pull: false })).accepted, 1);
    assert.equal((await post({ push: [push('1780000000000.0000.ipad', 'Older')], pull: false })).accepted, 0);
    assert.equal((await post({ push: [push('1790000000001.0000.ipad', 'B')], pull: false })).accepted, 1);
    const all = await post({ since: 0 });
    assert.equal(all.changes.length, 1);
    assert.equal(all.changes[0]!.data!.title, 'B');
    assert.equal(all.cursor, all.changes[0]!.changedAt);
    assert.equal((await post({ since: all.cursor })).changes.length, 0);
    assert.equal(store.records.size, 1);
  });

  it('refuses tables it doesn’t share, bad stamps, mismatched ids, and big batches', async () => {
    const { handle } = familyHelper();
    const bad = async (change: unknown) => (await handle('POST', '/v1/sync', { push: [change] })).status;
    assert.equal(await bad({ table: 'meta', id: 'x', mod: '1790000000000.0000.mac', data: { key: 'x' } }), 400);
    assert.equal(await bad({ table: 'books', id: 'b1', mod: 'yesterday', data: { id: 'b1' } }), 400);
    assert.equal(await bad({ table: 'books', id: 'b1', mod: '1790000000000.0000.mac', data: { id: 'b2' } }), 400);
    assert.equal(await bad({ table: 'books', id: '../x', mod: '1790000000000.0000.mac', data: { id: '../x' } }), 400);
    const many = Array.from({ length: 201 }, (_, i) => ({ table: 'books', id: `b${i}`, mod: '1790000000000.0000.mac', data: { id: `b${i}` } }));
    assert.equal((await handle('POST', '/v1/sync', { push: many })).status, 413);
    assert.equal((await handle('GET', '/v1/sync/media/..%2Fetc')).status, 400);
    assert.equal((await handle('POST', '/v1/sync/media/m1', { data: 'aGk=', type: 'text/html' })).status, 400);
  });

  it('is off without a store, and needs no AI key', async () => {
    const page = { origin: 'https://lms.example.com', 'x-izzy-classroom': '1' };
    assert.equal((await createHelper({ extraOrigins: ['https://lms.example.com'] })({ method: 'GET', path: '/v1/sync/status', headers: page })).status, 404);
    const res = await createHelper({ syncStore: new MemorySyncStore(), extraOrigins: ['https://lms.example.com'] })({
      method: 'GET',
      path: '/v1/sync/status',
      headers: page,
    });
    assert.deepEqual(JSON.parse(res.body as string), { available: true, hasData: false });
  });
});

describe('two devices, one school', () => {
  it('the Mac saves the school; the iPad (unused) takes it automatically; changes flow both ways', async () => {
    const helper = familyHelper();
    const mac = device('mac');
    await seedFreshHousehold(mac.repos, mac.clock);
    await addBook(mac.ctx, 'child_izzy', { title: 'Goodnight Leelanau' });
    await updateChild(mac.ctx, { ...(await mac.repos.children.get('child_izzy'))!, sayName: 'Izzee' });
    await addMedia(mac.ctx, { blob: new Blob([new Uint8Array(3000).fill(7)], { type: 'image/jpeg' }), childId: 'child_izzy', caption: 'Beans' });

    // Before anyone turns it on, a new device finds nothing and waits.
    const macSync = engine(mac, helper.transport);
    assert.equal((await macSync.init()).phase, 'off');
    await macSync.turnOn();
    assert.equal(macSync.current.phase, 'on');
    assert.equal((await mac.db.outbox()).length, 0, 'everything sent');

    // The iPad opens for the first time (a fresh school) — and takes the family's.
    const ipad = device('ipad', '2026-09-30T11:00:00.000Z');
    await seedFreshHousehold(ipad.repos, ipad.clock);
    const ipadSync = engine(ipad, helper.transport);
    const v = await ipadSync.init();
    assert.equal(v.phase, 'on');
    assert.equal(v.joined, 'adopted');
    const books = await ipad.repos.books.all();
    assert.deepEqual(
      books.map((b) => b.title),
      ['Goodnight Leelanau'],
    );
    assert.equal((await ipad.repos.children.get('child_izzy'))!.sayName, 'Izzee', 'the Mac’s version, not the iPad’s fresh one');
    const photo = (await ipad.repos.media.all())[0]!;
    assert.equal(photo.caption, 'Beans');
    assert.equal((await photo.blob.arrayBuffer()).byteLength, 3000);

    // Izzy reads on the iPad; the Mac sees it.
    ipad.clock.set('2026-09-30T12:00:00.000Z');
    await addBook(ipad.ctx, 'child_izzy', { title: 'The Snowy Day' });
    await ipadSync.syncNow();
    mac.clock.set('2026-09-30T12:01:00.000Z');
    await macSync.syncNow();
    assert.deepEqual((await mac.repos.books.all()).map((b) => b.title).sort(), ['Goodnight Leelanau', 'The Snowy Day']);

    // A deletion on the Mac reaches the iPad.
    const snowy = (await mac.repos.books.all()).find((b) => b.title === 'The Snowy Day')!;
    mac.clock.set('2026-09-30T12:02:00.000Z');
    await mac.repos.books.delete(snowy.id);
    await macSync.syncNow();
    await ipadSync.syncNow();
    assert.deepEqual(
      (await ipad.repos.books.all()).map((b) => b.title),
      ['Goodnight Leelanau'],
    );

    // Both change the same record: the later change wins everywhere.
    const izzy = (await mac.repos.children.get('child_izzy'))!;
    mac.clock.set('2026-09-30T13:00:00.000Z');
    await updateChild(mac.ctx, { ...izzy, sayName: 'Iz-ee' });
    ipad.clock.set('2026-09-30T13:05:00.000Z');
    await updateChild(ipad.ctx, { ...izzy, sayName: 'Is-ee' });
    await macSync.syncNow();
    await ipadSync.syncNow();
    await macSync.syncNow();
    assert.equal((await mac.repos.children.get('child_izzy'))!.sayName, 'Is-ee');
    assert.equal((await ipad.repos.children.get('child_izzy'))!.sayName, 'Is-ee');
  });

  it('a device with its own records asks first, and can make its school the family’s', async () => {
    const helper = familyHelper();
    const mac = device('mac');
    await seedFreshHousehold(mac.repos, mac.clock);
    await addBook(mac.ctx, 'child_izzy', { title: 'From the Mac' });
    const macSync = engine(mac, helper.transport);
    await macSync.init();
    await macSync.turnOn();

    const phone = device('phone', '2026-09-30T11:00:00.000Z');
    await seedFreshHousehold(phone.repos, phone.clock);
    await addBook(phone.ctx, 'child_izzy', { title: 'From the phone' });
    const phoneSync = engine(phone, helper.transport);
    const v = await phoneSync.init();
    assert.equal(v.phase, 'needs-choice');
    assert.deepEqual(v.cloud?.summary?.children, ['Izzy']);
    assert.equal(v.cloud?.summary?.books, 1);
    assert.deepEqual(
      (await phone.repos.books.all()).map((b) => b.title),
      ['From the phone'],
      'nothing replaced without a parent',
    );

    await phoneSync.replaceFamilySchool();
    mac.clock.set('2026-09-30T12:00:00.000Z');
    await macSync.syncNow();
    assert.deepEqual(
      (await mac.repos.books.all()).map((b) => b.title),
      ['From the phone'],
    );
  });

  it('turning sync on where the family already has a school never overwrites it', async () => {
    const helper = familyHelper();
    const mac = device('mac');
    await seedFreshHousehold(mac.repos, mac.clock);
    await updateChild(mac.ctx, { ...(await mac.repos.children.get('child_izzy'))!, sayName: 'Izzee' });
    const macSync = engine(mac, helper.transport);
    await macSync.init();
    await macSync.turnOn();

    // The phone was opened before the Mac turned sync on, so it shows "Off"…
    const phone = device('phone', '2026-09-30T11:00:00.000Z');
    await seedFreshHousehold(phone.repos, phone.clock);
    const phoneSync = engine(phone, helper.transport);
    await phone.repos.meta.put({ key: 'sync:state', value: { enabled: false, cursor: null } });
    (phoneSync as unknown as { view: { phase: string } }).view.phase = 'off';
    // …and a parent taps "Turn on" there: it takes the family's school instead of uploading an empty one.
    await phoneSync.turnOn();
    assert.equal(phoneSync.current.joined, 'adopted');
    assert.equal((await phone.repos.children.get('child_izzy'))!.sayName, 'Izzee');
    await macSync.syncNow();
    assert.equal((await mac.repos.children.get('child_izzy'))!.sayName, 'Izzee');
  });

  it('pausing keeps changes until sync is turned back on', async () => {
    const helper = familyHelper();
    const mac = device('mac');
    await seedFreshHousehold(mac.repos, mac.clock);
    const macSync = engine(mac, helper.transport);
    await macSync.init();
    await macSync.turnOn();
    await macSync.turnOff();
    await addBook(mac.ctx, 'child_izzy', { title: 'Offline book' });
    await macSync.syncNow();
    assert.equal((await macSync.init()).phase, 'off', 'still paused after a reload');
    assert.equal(helper.store.records.has(`books/${(await mac.repos.books.all())[0]!.id}`), false);
    await macSync.turnOn();
    assert.equal(helper.store.records.has(`books/${(await mac.repos.books.all())[0]!.id}`), true);
  });
});

describe('the AWS store (DynamoDB + S3)', () => {
  const creds = () => ({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret', sessionToken: 'tok' });

  it('writes conditionally, reads changes by time, and pages', async () => {
    const calls: { url: string; target?: string; body: Record<string, unknown> }[] = [];
    let conditionFails = false;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, target: headers['x-amz-target'], body });
      assert.match(headers.Authorization!, /\/us-east-1\/dynamodb\/aws4_request/);
      if (headers['x-amz-target'] === 'DynamoDB_20120810.PutItem' && conditionFails)
        return Response.json({ __type: 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException' }, { status: 400 });
      if (headers['x-amz-target'] === 'DynamoDB_20120810.Query')
        return Response.json({
          Items: [
            { tbl: { S: 'books' }, rid: { S: 'b1' }, mod: { S: '1790000000000.0000.mac' }, changedAt: { N: '1790000000500' }, data: { S: '{"id":"b1"}' } },
            { tbl: { S: 'books' }, rid: { S: 'b2' }, mod: { S: '1790000000001.0000.mac' }, changedAt: { N: '1790000000600' }, deleted: { BOOL: true } },
          ],
          LastEvaluatedKey: { pk: { S: 'family' }, sk: { S: 'books/b2' }, changedAt: { N: '1790000000600' } },
        });
      return Response.json({});
    }) as unknown as typeof fetch;
    const store = new AwsSyncStore({ table: 'FamilyRecords', bucket: 'family-media', region: 'us-east-1', credentials: creds, fetchImpl });

    assert.equal(await store.put({ table: 'books', id: 'b1', mod: '1790000000000.0000.mac', data: { id: 'b1' } }, 1790000000500), true);
    const put = calls[0]!.body as { ConditionExpression: string; Item: Record<string, { S?: string; N?: string }> };
    assert.equal(calls[0]!.url, 'https://dynamodb.us-east-1.amazonaws.com/');
    assert.equal(put.ConditionExpression, 'attribute_not_exists(sk) OR #m < :m');
    assert.equal(put.Item.sk!.S, 'books/b1');
    assert.equal(put.Item.changedAt!.N, '1790000000500');
    conditionFails = true;
    assert.equal(await store.put({ table: 'books', id: 'b1', mod: '1780000000000.0000.mac', data: { id: 'b1' } }, 1), false);

    const page = await store.changesSince(1790000000000, null, 400);
    assert.equal(page.changes.length, 2);
    assert.deepEqual(page.changes[1], { table: 'books', id: 'b2', mod: '1790000000001.0000.mac', deleted: true, changedAt: 1790000000600 });
    assert.ok(page.next);
    await store.changesSince(1790000000000, page.next, 400);
    const q = calls.at(-1)!.body as { IndexName: string; ExclusiveStartKey: unknown };
    assert.equal(q.IndexName, 'byChange');
    assert.deepEqual(q.ExclusiveStartKey, { pk: { S: 'family' }, sk: { S: 'books/b2' }, changedAt: { N: '1790000000600' } });
  });

  it('stores photos in S3 with a signed payload hash', async () => {
    const seen: { url: string; method: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, method: String(init.method), headers: init.headers as Record<string, string> });
      if (init.method === 'GET')
        return url.endsWith('/missing')
          ? new Response('', { status: 403 })
          : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
      return new Response('');
    }) as unknown as typeof fetch;
    const store = new AwsSyncStore({ table: 't', bucket: 'family-media', region: 'us-east-1', credentials: creds, fetchImpl });
    await store.putMedia('media_1', new Uint8Array([1, 2, 3]), 'image/png');
    assert.equal(seen[0]!.url, 'https://family-media.s3.us-east-1.amazonaws.com/media/media_1');
    assert.equal(seen[0]!.headers['x-amz-content-sha256'], '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
    assert.match(seen[0]!.headers.Authorization!, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token/);
    assert.deepEqual([...(await store.getMedia('media_1'))!.bytes], [1, 2, 3]);
    assert.equal(await store.getMedia('missing'), null);
  });
});
