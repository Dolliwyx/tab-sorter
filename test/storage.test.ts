import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extensionStorage, migrateStorage } from '../src/storage.ts';

test('snapshot lookups stay synchronous and writes become visible only after persistence', async () => {
  const records: Record<string, unknown> = { 'sort-mode': 'title' };
  const reads: unknown[] = [];
  let finishWrite!: () => void;
  const persisted = new Promise<void>(resolve => { finishWrite = resolve; });
  const area = {
    get: async (key: unknown) => { reads.push(key); return { ...records }; },
    set: async (values: Record<string, unknown>) => { await persisted; Object.assign(records, values); },
  } as chrome.storage.LocalStorageArea;
  const storage = await extensionStorage(area);
  const writing = storage.setItem('sort-mode', 'hostname');
  assert.equal(storage.getItem('sort-mode'), 'title');
  assert.equal(records['sort-mode'], 'title');
  finishWrite();
  await writing;
  assert.equal(records['sort-mode'], 'hostname');
  assert.equal(storage.getItem('sort-mode'), 'hostname');
  assert.equal(storage.getItem('missing'), null);
  assert.deepEqual(reads, [null]);
});

test('migration preserves settings and ownership, keeps newer values and runs only once', async () => {
  const legacy = new Map([
    ['sort-mode', 'hostname'], ['group-hostname', 'true'], ['group-scope', 'domain'],
    ['hostname-group:example.com', 'true'], ['hostname-group-label:Example', '["example.com"]'],
    ['domain-group:example.org', 'true'], ['domain-group-label:Example Org', '["example.org"]'],
    ['unrelated', 'ignore'],
  ]);
  const records: Record<string, unknown> = { 'sort-mode': 'title' };
  let fail = true;
  const area = {
    get: async (key: string | null) => key === null ? { ...records } : { [key]: records[key] },
    set: async (values: Record<string, unknown>) => {
      if (fail) throw new Error('Storage failed');
      Object.assign(records, values);
    },
  } as chrome.storage.LocalStorageArea;
  const old = {
    length: legacy.size,
    key: (index: number) => [...legacy.keys()][index],
    getItem: (key: string) => legacy.get(key) ?? null,
  } as Storage;
  await assert.rejects(migrateStorage(old, area), /Storage failed/);
  assert.equal(records['local-storage-migrated'], undefined);
  fail = false;
  await migrateStorage(old, area);
  assert.deepEqual(records, { ...Object.fromEntries([...legacy].filter(([key]) => key !== 'unrelated')),
    'sort-mode': 'title', 'local-storage-migrated': true } as Record<string, unknown>);
  legacy.set('group-scope', 'hostname');
  await migrateStorage(old, area);
  assert.equal(records['group-scope'], 'domain');
  assert.equal(legacy.get('hostname-group:example.com'), 'true', 'Leave legacy data intact');
  const storage = await extensionStorage(area);
  assert.equal(storage.getItem('missing'), null);
  assert.equal(storage.getItem('local-storage-migrated'), null);
  await storage.setItem('sort-mode', 'hostname');
  assert.equal(storage.getItem('sort-mode'), 'hostname');
  fail = true;
  await assert.rejects(async () => storage.setItem('sort-mode', 'title'), /Storage failed/);
  assert.equal(storage.getItem('sort-mode'), 'hostname', 'Failed persistence must not change the snapshot');
});
