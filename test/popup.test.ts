import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortCurrentWindow } from '../src/sort.ts';
import { extensionStorage } from '../src/storage.ts';

class Control {
  value = '';
  checked = false;
  disabled = false;
  textContent = '';
  dataset: Record<string, string> = {};
  listeners = new Map<string, (event: { preventDefault(): void }) => unknown>();
  addEventListener(type: string, listener: (event: { preventDefault(): void }) => unknown) {
    this.listeners.set(type, listener);
  }
  async trigger(type: string) {
    await this.listeners.get(type)!({ preventDefault() {} });
  }
}

test('popup remembers grouping scope, gates controls, submits the choice and recovers after failures', async () => {
  const keys = ['document', 'localStorage', 'chrome'];
  const original = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  try {
    for (const saved of [null, 'invalid', 'domain']) {
      const elements = new Map(['sort-form', 'sort-mode', 'group-hostname', 'group-scope', 'sort-button', 'status', 'group-hint']
        .map(id => [id, new Control()]));
      const legacy = new Map([
        ['sort-mode', 'hostname'], ['group-hostname', 'false'],
        ['hostname-group:legacy.example', 'true'], ['hostname-group-label:Legacy', '["legacy.example"]'],
        ['domain-group:example.org', 'true'], ['domain-group-label:Example Org', '["example.org"]'],
      ]);
      if (saved) legacy.set('group-scope', saved);
      const records = new Map<string, unknown>();
      const storage = {
        get length() { return legacy.size; },
        key: (index: number) => [...legacy.keys()][index] ?? null,
        getItem: (key: string) => legacy.get(key) ?? null,
        setItem: (key: string, value: string) => { legacy.set(key, value); },
      };
      let finishMigration!: () => void;
      const migration = new Promise<void>(resolve => { finishMigration = resolve; });
      let beforeWrite = async () => { await migration; };
      let messages = 0;
      let groupsCreated = 0;
      let query = async () => [
        { id: 1, title: 'Root', url: 'https://example.com', groupId: -1, pinned: false, index: 0 },
        { id: 2, title: 'Docs', url: 'https://docs.example.com', groupId: -1, pinned: false, index: 1 },
      ];
      Object.defineProperties(globalThis, {
        document: { configurable: true, value: { querySelector: (selector: string) => elements.get(selector.slice(1)) } },
        localStorage: { configurable: true, value: storage },
        chrome: { configurable: true, value: {
          storage: { local: {
            get: async (key: string | null) => key === null ? Object.fromEntries(records) : { [key]: records.get(key) },
            set: async (values: Record<string, unknown>) => {
              await beforeWrite();
              for (const [key, value] of Object.entries(values)) records.set(key, value);
            },
          } },
          windows: { getCurrent: async () => ({ id: 1 }) },
          runtime: { sendMessage: async (message: { type: string; windowId: number }) => {
            assert.deepEqual(message, { type: 'sort-tabs', windowId: 1 });
            messages++;
            const storage = await extensionStorage();
            try {
              return { result: await sortCurrentWindow(
                records.get('sort-mode') === 'hostname' ? 'hostname' : 'title',
                records.get('group-hostname') === 'true', chrome, storage,
                records.get('group-scope') === 'domain' ? 'domain' : 'hostname',
              ) };
            } catch (error) {
              return { error: (error as Error).message };
            }
          } },
          tabs: {
            query: () => query(),
            group: async () => { groupsCreated++; return 100; },
            move: async () => {},
          },
          scripting: { executeScript: async () => [] },
          tabGroups: { query: async () => [], update: async () => {} },
        } },
      });
      const module = new URL('../src/popup.ts', import.meta.url);
      module.searchParams.set('case', String(saved));
      await import(module.href);
      const settle = () => new Promise(resolve => setImmediate(resolve));
      await settle();
      const mode = elements.get('sort-mode')!;
      const grouping = elements.get('group-hostname')!;
      const scope = elements.get('group-scope')!;
      const button = elements.get('sort-button')!;
      const status = elements.get('status')!;
      const form = elements.get('sort-form')!;
      assert.equal(records.size, 0, 'Chrome storage starts empty and migration is still pending');
      assert.ok([mode, grouping, scope, button].every(control => control.disabled));
      await form.trigger('submit');
      assert.equal(messages, 0, 'Cannot sort before migration completes');
      finishMigration();
      await settle();
      beforeWrite = async () => {};
      assert.deepEqual(Object.fromEntries(records), { ...Object.fromEntries(legacy), 'local-storage-migrated': true });
      assert.equal(mode.value, 'hostname', 'Load migrated settings, not defaults');
      assert.equal(grouping.checked, false);
      assert.equal(button.disabled, false);
      assert.equal(scope.value, saved === 'domain' ? 'domain' : 'hostname');
      assert.equal(scope.disabled, true);
      mode.value = 'hostname';
      await mode.trigger('change');
      assert.equal(grouping.disabled, false);
      assert.equal(scope.disabled, true);
      grouping.checked = true;
      await grouping.trigger('change');
      assert.equal(scope.disabled, false);
      await form.trigger('submit');
      assert.equal(groupsCreated, saved === 'domain' ? 1 : 0, 'Submit the loaded grouping scope');
      scope.value = 'domain';
      await scope.trigger('change');
      await settle();
      assert.equal(records.get('group-scope'), 'domain');
      mode.value = 'title';
      await mode.trigger('change');
      assert.equal(grouping.disabled, true);
      assert.equal(scope.disabled, true);
      assert.equal(scope.value, 'domain', 'Changing sort mode retains the grouping scope');
      mode.value = 'hostname';
      await mode.trigger('change');
      grouping.checked = false;
      await grouping.trigger('change');
      assert.equal(scope.disabled, true);
      grouping.checked = true;
      await grouping.trigger('change');
      let rejectQuery!: (reason: Error) => void;
      query = () => new Promise((_, reject) => { rejectQuery = reject; });
      const submission = form.trigger('submit');
      assert.ok([mode, grouping, scope, button].every(control => control.disabled));
      await new Promise(resolve => setImmediate(resolve));
      rejectQuery(new Error('Fixture failure'));
      await submission;
      assert.equal(status.dataset.error, 'true');
      assert.match(status.textContent, /Fixture failure/);
      assert.ok([mode, grouping, scope, button].every(control => !control.disabled));

      query = async () => [];
      let finishSave!: () => void;
      beforeWrite = () => new Promise<void>(resolve => { finishSave = resolve; });
      scope.value = 'hostname';
      await scope.trigger('change');
      const beforeSubmit = messages;
      const waiting = form.trigger('submit');
      await settle();
      assert.equal(messages, beforeSubmit, 'Submission waits for the setting write');
      assert.equal(records.get('group-scope'), 'domain', 'Unfinished writes are not yet persisted');
      finishSave();
      await waiting;
      assert.equal(records.get('group-scope'), 'hostname');
      assert.equal(messages, beforeSubmit + 1, 'Sort only after settings are saved');

      let rejectSave!: (error: Error) => void;
      beforeWrite = () => new Promise<void>((_, reject) => { rejectSave = reject; });
      scope.value = 'domain';
      await scope.trigger('change');
      const beforeFailure = messages;
      const failedSubmission = form.trigger('submit');
      await settle();
      rejectSave(new Error('Setting save failed'));
      await failedSubmission;
      assert.equal(messages, beforeFailure, 'A failed setting save must not send a sort request');
      assert.equal(records.get('group-scope'), 'hostname');
      assert.equal(status.dataset.error, 'true');
      assert.match(status.textContent, /Setting save failed/);
      assert.equal(button.disabled, true);
      await form.trigger('submit');
      assert.equal(messages, beforeFailure, 'Sorting remains disabled after a failed save');
    }
  } finally {
    keys.forEach((key, index) => {
      if (original[index]) Object.defineProperty(globalThis, key, original[index]!);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
