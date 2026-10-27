import assert from 'node:assert/strict';
import { test } from 'node:test';

test('commands and popup sort immediately using saved settings, pin the window and prevent overlap', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const originalError = console.error;
  try {
    let command!: (name: string, tab?: { windowId: number }) => void;
    let message!: (data: unknown, sender: { id: string }, respond: (value: any) => void) => boolean | undefined;
    const records: Record<string, unknown> = {};
    let tabs: any[] = [];
    const moves: number[][] = [];
    const queries: unknown[] = [];
    const badges: string[] = [];
    let groups = 0;
    let focused = 7;
    let read: (() => Promise<void>) | undefined;
    let failure = false;
    const reset = () => {
      tabs = [
        { id: 1, title: 'Pinned', pinned: true, groupId: -1, index: 0, windowId: 7 },
        { id: 2, title: 'Zebra', url: 'https://example.com', groupId: -1, index: 1, windowId: 7 },
        { id: 3, title: 'Alpha', url: 'https://docs.example.com', groupId: -1, index: 2, windowId: 7 },
      ];
      moves.length = queries.length = 0;
    };
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
      commands: { onCommand: { addListener: (listener: typeof command) => { command = listener; } } },
      runtime: { id: 'extension', onMessage: { addListener: (listener: typeof message) => { message = listener; } } },
      windows: { getLastFocused: async () => ({ id: focused }) },
      action: { setBadgeText: async ({ text }: { text: string }) => { badges.push(text); } },
      storage: { local: {
        get: async (key: string) => {
          await read?.();
          if (failure) throw new Error('Storage failed');
          return { [key]: records[key] };
        },
        set: async (values: Record<string, unknown>) => { Object.assign(records, values); },
      } },
      tabs: {
        query: async (query: unknown) => { queries.push(query); return tabs.map(tab => ({ ...tab })); },
        move: async (ids: number[]) => { moves.push(ids); },
        group: async ({ tabIds }: { tabIds: number[] }) => {
          groups++;
          for (const tab of tabs) if (tabIds.includes(tab.id)) tab.groupId = 100;
          return 100;
        },
      },
      tabGroups: { query: async () => [], update: async () => {}, move: async () => {} },
      scripting: { executeScript: async () => [] },
    } });
    console.error = () => {};
    await import('../src/background.ts');
    const settle = () => new Promise(resolve => setImmediate(resolve));
    reset();
    command('unknown');
    await settle();
    assert.equal(queries.length, 0);
    command('sort-tabs', { windowId: 7 });
    await settle();
    assert.deepEqual(moves, [[3], [2]], 'Default is title sort; pinned tab never moves');
    assert.deepEqual(queries, [{ windowId: 7 }]);

    records['sort-mode'] = 'hostname';
    records['group-hostname'] = 'true';
    records['group-scope'] = 'domain';
    reset();
    let release!: () => void;
    read = () => new Promise<void>(resolve => { release = resolve; });
    command('sort-tabs');
    await settle();
    focused = 9;
    command('sort-tabs');
    const busy = await new Promise<any>(resolve => {
      assert.equal(message({ type: 'sort-tabs', windowId: 7 }, { id: 'extension' }, resolve), true);
    });
    assert.match(busy.error, /already in progress/);
    read = undefined;
    release();
    await settle();
    assert.equal(groups, 1);
    assert.deepEqual(queries, [{ windowId: 7 }, { windowId: 7 }], 'Focus changes cannot retarget the run');
    assert.equal(records['domain-group:example.com'], 'true');

    for (const [mode, grouping, scope] of [
      ['hostname', 'false', 'domain'], ['title', 'true', 'domain'], ['hostname', 'true', 'hostname'],
    ]) {
      Object.assign(records, { 'sort-mode': mode, 'group-hostname': grouping, 'group-scope': scope });
      reset();
      const result = await new Promise<any>(resolve => message({ type: 'sort-tabs', windowId: 8 }, { id: 'extension' }, resolve));
      assert.equal(result.result.tabsSorted, 2);
      assert.equal(result.result.groupsCreated, 0);
      assert.deepEqual(queries, Array.from({ length: mode === 'hostname' && grouping === 'true' ? 2 : 1 }, () => ({ windowId: 8 })));
    }
    failure = true;
    reset();
    command('sort-tabs', { windowId: 7 });
    await settle();
    assert.equal(badges.at(-1), '!');
    assert.equal(moves.length, 0, 'Storage failure stops before moving tabs');
    failure = false;
    command('sort-tabs', { windowId: 7 });
    await settle();
    assert.equal(badges.at(-1), '', 'Next successful command clears the failure badge');
    const invalid = await new Promise<any>(resolve => message({ type: 'sort-tabs', windowId: -1 }, { id: 'extension' }, resolve));
    assert.match(invalid.error, /Invalid browser window/);
    assert.equal(message({ type: 'sort-tabs', windowId: 7 }, { id: 'untrusted' }, () => assert.fail()), undefined);
  } finally {
    console.error = originalError;
    if (original) Object.defineProperty(globalThis, 'chrome', original);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});
