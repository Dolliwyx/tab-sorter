import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostname, sortCurrentWindow } from '../src/sort.ts';

function tab(id: number, title: string, url = 'https://example.com', groupId = -1, pinned = false): chrome.tabs.Tab {
  return { id, title, url, groupId, pinned, index: 0, windowId: 1, active: false,
    highlighted: false, incognito: false, discarded: false, autoDiscardable: true, selected: false,
    frozen: false, lastAccessed: 0 };
}

// Model only the Chrome operations we use, enforcing pinned and group boundaries.
function browser(initial: chrome.tabs.Tab[], records = new Map<string, string>()) {
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => { records.set(key, value); },
  };
  let tabs = initial.map((tab, index) => ({ ...tab, index }));
  const groups = new Map(initial.filter(tab => tab.groupId !== -1).map(tab => [tab.groupId,
    { title: 'Manual', color: 'blue', collapsed: true }]));
  const calls: { operation: string; ids: number[] }[] = [];
  const reads: number[] = [];
  const metadata = new Map<number, { og?: string; app?: string; host?: string; error?: boolean }>();
  let nextGroup = Math.max(99, ...initial.map(tab => tab.groupId)) + 1;
  const reindex = () => tabs.forEach((tab, index) => { tab.index = index; });
  const boundary = (index: number) => {
    assert.ok(index >= tabs.filter(tab => tab.pinned).length, 'Never move before pinned tabs');
    if (index > 0 && index < tabs.length) {
      assert.ok(tabs[index - 1].groupId === -1 || tabs[index - 1].groupId !== tabs[index].groupId,
        'Never insert a block inside another group');
    }
  };
  const api = {
    scripting: {
      async executeScript({ target, func, injectImmediately }: { target: { tabId: number }; func: () => unknown; injectImmediately: boolean }) {
        assert.equal(injectImmediately, true, 'Do not wait for the entire page to load');
        reads.push(target.tabId);
        const site = metadata.get(target.tabId);
        const page = tabs.find(tab => tab.id === target.tabId);
        if (!page || site?.error) throw new Error('Cannot access page');
        const saved = ['document', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
        Object.defineProperty(globalThis, 'document', { configurable: true, value: {
          querySelector: (selector: string) => ({ content: selector.includes('og:site_name') ? site?.og || '' : site?.app || '' }),
        } });
        Object.defineProperty(globalThis, 'location', { configurable: true,
          value: { hostname: site?.host || new URL(page.url!).hostname } });
        try {
          return [{ frameId: 0, result: func() }];
        } finally {
          for (const [key, descriptor] of saved) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
          }
        }
      },
    },
    tabs: {
      async query(options: unknown) {
        assert.deepEqual(options, { currentWindow: true });
        return tabs.map(tab => ({ ...tab }));
      },
      async move(id: number, { index }: { index: number }) {
        const from = tabs.findIndex(tab => tab.id === id);
        assert.ok(from >= 0);
        const [tab] = tabs.splice(from, 1);
        assert.equal(tab.pinned, false, 'Pinned tabs must never be moved');
        const siblings = tabs.filter(other => other.groupId === tab.groupId);
        if (tab.groupId !== -1 && siblings.length) {
          const start = tabs.indexOf(siblings[0]);
          assert.ok(index >= start && index <= start + siblings.length, 'Move only within the tab\'s group');
        } else {
          boundary(index);
        }
        tabs.splice(index, 0, tab);
        reindex();
        calls.push({ operation: 'move', ids: [id] });
      },
      async group({ tabIds, groupId }: { tabIds: number[]; groupId?: number }) {
        const members = tabs.filter(tab => tabIds.includes(tab.id!));
        assert.equal(members.length, tabIds.length);
        assert.ok(members.every(tab => !tab.pinned && tab.groupId === -1));
        const existing = groupId !== undefined;
        const id = groupId ?? nextGroup++;
        tabs = tabs.filter(tab => !tabIds.includes(tab.id!));
        const siblings = tabs.filter(tab => tab.groupId === id);
        const index = existing ? tabs.indexOf(siblings[siblings.length - 1]) + 1 : members[0].index;
        if (existing) {
          assert.ok(groups.has(id) && index > 0, 'Expand only a group in the current window');
        } else {
          boundary(index);
          groups.set(id, { title: '', color: 'grey', collapsed: false });
        }
        tabs.splice(index, 0, ...members.map(tab => ({ ...tab, groupId: id })));
        reindex();
        calls.push({ operation: existing ? 'expandGroup' : 'group', ids: tabIds });
        return id;
      },
    },
    tabGroups: {
      async query({ windowId }: { windowId: number }) {
        assert.equal(windowId, 1, 'Only query groups in the current window');
        return [...groups].filter(([id]) => tabs.some(tab => tab.groupId === id))
          .map(([id, properties]) => ({ id, windowId, shared: false, ...properties }));
      },
      async move(groupId: number, { index }: { index: number }) {
        const members = tabs.filter(tab => tab.groupId === groupId);
        assert.ok(members.length);
        tabs = tabs.filter(tab => tab.groupId !== groupId);
        boundary(index);
        tabs.splice(index, 0, ...members);
        reindex();
        calls.push({ operation: 'moveGroup', ids: members.map(tab => tab.id!) });
      },
      async update(groupId: number, properties: { title: string }) {
        assert.ok(groups.has(groupId));
        assert.ok(groupId >= 100 || records.get('hostname-group:' + hostname(tabs.find(tab => tab.groupId === groupId)!)) === 'true',
          'Only name a new group or a previously recorded hostname group');
        Object.assign(groups.get(groupId)!, properties);
        calls.push({ operation: 'nameGroup', ids: [groupId] });
      },
    },
  } as unknown as typeof chrome;
  return { api, calls, reads, metadata, groups, storage, records, tabs: () => tabs, ids: () => tabs.map(tab => tab.id) };
}

test('title sorting preserves pinned order, manual group membership and metadata, and ties', async () => {
  const chrome = browser([
    tab(1, 'Pinned Z', undefined, -1, true), tab(2, 'Pinned A', undefined, -1, true),
    tab(3, 'Zulu'), tab(4, 'Tab 10', undefined, 9), tab(5, 'Beta'),
    tab(6, 'Alpha', undefined, 8), tab(7, 'alpha', undefined, 8),
  ]);
  assert.deepEqual(await sortCurrentWindow('title', true, chrome.api, chrome.storage), { tabsSorted: 5, groupsCreated: 0 });
  assert.deepEqual(chrome.ids(), [1, 2, 6, 7, 4, 5, 3]);
  assert.deepEqual(chrome.tabs().filter(tab => tab.groupId === 8).map(tab => tab.id), [6, 7]);
  assert.deepEqual(chrome.groups.get(8), { title: 'Manual', color: 'blue', collapsed: true });
  assert.ok(!chrome.calls.some(call => call.operation === 'group'));
});

test('hostname grouping excludes pinned/manual tabs, singletons, invalid/internal URLs, and subdomains', async () => {
  const chrome = browser([
    tab(1, 'Pinned', 'https://example.com', -1, true),
    tab(2, 'Page 10', 'https://example.com/path'),
    tab(3, 'Manual Z', 'https://example.com', 7), tab(4, 'Manual A', 'https://aaa.com', 7),
    tab(5, 'Page 2', 'http://example.com:8080/other'),
    tab(6, 'Docs', 'https://docs.example.com'), tab(7, 'Settings', 'chrome://settings'),
    tab(8, 'Broken', 'not a URL'), tab(9, 'Single', 'https://zzz.com'),
    tab(10, 'Pending', 'chrome://newtab'),
  ]);
  chrome.tabs()[9].pendingUrl = 'https://zzz.com/loading';
  assert.deepEqual(await sortCurrentWindow('hostname', true, chrome.api, chrome.storage), { tabsSorted: 9, groupsCreated: 2 });
  assert.deepEqual(chrome.ids(), [1, 4, 3, 5, 2, 10, 9, 8, 7, 6]);
  assert.deepEqual(chrome.calls.filter(call => call.operation === 'group').map(call => call.ids), [[2, 5], [9, 10]]);
  assert.deepEqual(chrome.groups.get(7), { title: 'Manual', color: 'blue', collapsed: true });
  assert.equal(chrome.groups.get(100)?.title, '[🤖] example.com');
  assert.equal(chrome.groups.get(101)?.title, '[🤖] zzz.com');
  for (const id of [6, 7, 8]) assert.equal(chrome.tabs().find(tab => tab.id === id)?.groupId, -1);
  const before = chrome.ids();
  await sortCurrentWindow('hostname', true, chrome.api, chrome.storage);
  assert.deepEqual(chrome.ids(), before, 'Repeated sorting is stable');
  assert.equal(chrome.calls.filter(call => call.operation === 'group').length, 2);
});

test('sorting without grouping uses natural title order and sorts inside intact blocks', async () => {
  const chrome = browser([
    tab(1, 'Zulu', 'https://zzz.com', 3), tab(2, 'Tab 10', 'https://aaa.com', 3),
    tab(3, 'Tab 2', 'https://aaa.com', 3), tab(4, 'Alpha', 'https://aaa.com'),
    tab(5, 'Beta', 'https://aaa.com'),
  ]);
  chrome.storage.getItem = () => { throw new Error('Unmarked groups need no ownership reads'); };
  chrome.storage.setItem = () => { throw new Error('Ownership must not be written'); };
  await sortCurrentWindow('hostname', false, chrome.api, chrome.storage);
  assert.deepEqual(chrome.ids(), [3, 2, 1, 4, 5]);
  assert.ok(!chrome.calls.some(call => call.operation === 'group'));
  assert.ok(chrome.tabs().slice(0, 3).every(tab => tab.groupId === 3));
  await sortCurrentWindow('title', false, chrome.api, chrome.storage);
  assert.deepEqual(chrome.ids(), [3, 2, 1, 4, 5]);
});

test('protected groups precede recognized groups and ungrouped tabs in both modes, with grouping on or off', async () => {
  for (const mode of ['title', 'hostname'] as const) {
    for (const grouping of [false, true]) {
      const chrome = browser([
        tab(1, 'Pinned', undefined, -1, true), tab(2, 'Alpha', 'https://a.com'),
        tab(3, 'Group 10 B', 'https://b2.com', 42), tab(4, 'Group 10 A', 'https://b2.com', 42),
        tab(5, 'Manual Z 2', 'https://z.com', 7), tab(6, 'Manual Z 1', 'https://z.com', 7),
        tab(7, 'Group 2 Tab 10', 'https://b1.com', 99), tab(8, 'Group 2 Tab 2', 'https://b1.com', 99),
        tab(9, 'Manual Y', 'https://y.com', 8), tab(10, 'Beta', 'https://c.com'),
      ], new Map([
        ['hostname-group:b1.com', 'true'], ['hostname-group:b2.com', 'true'],
        ['hostname-group-label:Friendly', '["b2.com"]'],
      ]));
      chrome.groups.get(42)!.title = '[🤖] Friendly';
      chrome.groups.get(99)!.title = '[🤖] b1.com';
      const metadata = structuredClone([...chrome.groups]);
      for (let run = 0; run < 2; run++) {
        assert.deepEqual(await sortCurrentWindow(mode, grouping, chrome.api, chrome.storage),
          { tabsSorted: 9, groupsCreated: 0 });
        assert.deepEqual(chrome.ids(), [1, 9, 6, 5, 8, 7, 4, 3, 2, 10]);
        assert.deepEqual([...chrome.groups], metadata);
        assert.ok(chrome.calls.every(call => call.operation === 'move' || call.operation === 'moveGroup'));
      }
      if (mode === 'title' || !grouping) assert.deepEqual(chrome.reads, [], 'Sorting alone does not read pages');
    }
  }
});

test('mixed, duplicate, renamed and unrecorded groups retain protected-group priority', async () => {
  for (const mode of ['title', 'hostname'] as const) {
    for (const issue of ['mixed', 'duplicate', 'renamed', 'unrecorded'] as const) {
      const chrome = browser([
        tab(1, 'Auto 2', 'https://aaa.com', 99), tab(2, 'Auto 1', 'https://aaa.com', 99),
        tab(3, 'Protected 2', 'https://zzz.com', 42),
        tab(4, 'Protected 1', issue === 'mixed' ? 'https://other.com' : 'https://zzz.com', 42),
        ...(issue === 'duplicate' ? [tab(5, 'Protected 3', 'https://zzz.com', 43)] : []),
        tab(8, 'A', 'https://a.com'),
      ], new Map([
        ['hostname-group:aaa.com', 'true'],
        ...(issue === 'unrecorded' ? [] : [['hostname-group:zzz.com', 'true'] as [string, string]]),
      ]));
      chrome.groups.get(99)!.title = '[🤖] aaa.com';
      chrome.groups.get(42)!.title = issue === 'renamed' ? 'My group' : '[🤖] zzz.com';
      if (issue === 'duplicate') chrome.groups.get(43)!.title = '[🤖] zzz.com';
      const metadata = structuredClone([...chrome.groups]);
      await sortCurrentWindow(mode, false, chrome.api, chrome.storage);
      assert.deepEqual(chrome.ids(), [4, 3, ...(issue === 'duplicate' ? [5] : []), 2, 1, 8]);
      assert.deepEqual([...chrome.groups], metadata);
      assert.deepEqual(chrome.reads, []);
    }
  }
});

test('group recognition failures stop before moving tabs even when grouping is off', async () => {
  for (const mode of ['title', 'hostname'] as const) {
    for (const failure of ['query', 'storage', 'label'] as const) {
      const chrome = browser([
        tab(1, 'Group B', undefined, 42), tab(2, 'Group A', undefined, 42), tab(3, 'Ungrouped'),
      ], new Map([['hostname-group:example.com', 'true']]));
      chrome.groups.get(42)!.title = '[🤖] example.com';
      if (failure === 'query') chrome.api.tabGroups.query = async () => { throw new Error('Group lookup failed'); };
      if (failure === 'storage') chrome.storage.getItem = () => { throw new Error('Storage failed'); };
      if (failure === 'label') chrome.records.set('hostname-group-label:example.com', '{}');
      await assert.rejects(sortCurrentWindow(mode, false, chrome.api, chrome.storage),
        failure === 'query' ? /Group lookup failed/ : failure === 'storage' ? /Storage failed/ : /Invalid saved group label/);
      assert.deepEqual(chrome.ids(), [1, 2, 3]);
      assert.deepEqual(chrome.calls, []);
    }
  }
});

test('empty and all-pinned windows are no-ops; Chrome failures propagate', async () => {
  for (const tabs of [[], [tab(1, 'Pinned', undefined, -1, true)]]) {
    const chrome = browser(tabs);
    assert.deepEqual(await sortCurrentWindow('hostname', true, chrome.api, chrome.storage), { tabsSorted: 0, groupsCreated: 0 });
    assert.deepEqual(chrome.calls, []);
  }
  const chrome = browser([tab(1, 'A')]);
  chrome.api.tabs.move = (() => Promise.reject(new Error('Tab was closed'))) as unknown as typeof chrome.api.tabs.move;
  await assert.rejects(sortCurrentWindow('title', false, chrome.api, chrome.storage), /Tab was closed/);
  assert.equal(hostname({ url: 'file:///tmp/example.com' }), '');
  assert.equal(hostname({ url: 'https://EXAMPLE.com/a' }), 'example.com');
});

test('ownership survives changed IDs and expands one or two arrivals without altering protected groups', async () => {
  const original = browser([tab(1, 'Page 2'), tab(2, 'Page 1')]);
  await sortCurrentWindow('hostname', true, original.api, original.storage);
  assert.equal(original.groups.get(100)?.title, '[🤖] example.com');
  assert.equal(original.records.size, 1);

  // A fresh browser/storage wrapper models reopening the popup after Chrome restores new IDs.
  const restored = browser([
    tab(10, 'Pinned', undefined, -1, true),
    tab(11, 'Page 2', undefined, 42), tab(12, 'Page 1', undefined, 42),
    tab(13, 'Manual', undefined, 7), tab(14, 'Arrival'),
    tab(15, 'Docs', 'https://docs.example.com'), tab(16, 'Settings', 'chrome://settings'),
  ], new Map(original.records));
  const metadata = { title: '[🤖] example.com', color: 'blue', collapsed: true };
  restored.groups.set(42, { ...metadata });
  restored.groups.get(7)!.title = 'example.com';
  const manual = { ...restored.groups.get(7)! };
  assert.deepEqual(await sortCurrentWindow('hostname', true, restored.api, restored.storage),
    { tabsSorted: 6, groupsCreated: 0 });
  assert.deepEqual(restored.tabs().filter(tab => tab.groupId === 42).map(tab => tab.id), [14, 12, 11]);
  assert.deepEqual(restored.groups.get(42), metadata);
  assert.deepEqual(restored.groups.get(7), manual);
  for (const id of [10, 15, 16]) assert.equal(restored.tabs().find(tab => tab.id === id)?.groupId, -1);
  assert.deepEqual(restored.calls.filter(call => call.operation === 'expandGroup').map(call => call.ids), [[14]]);
  assert.ok(!restored.calls.some(call => call.operation === 'group'));

  const reopened = browser([
    ...restored.tabs().map(tab => ({ ...tab, groupId: tab.groupId === 42 ? 99 : tab.groupId })),
    tab(17, 'Later 2'), tab(18, 'Later 1'),
  ], new Map(restored.records));
  reopened.groups.set(99, { ...metadata });
  assert.deepEqual(await sortCurrentWindow('hostname', true, reopened.api, reopened.storage),
    { tabsSorted: 8, groupsCreated: 0 });
  assert.deepEqual(reopened.calls.filter(call => call.operation === 'expandGroup').map(call => call.ids), [[17, 18]]);
  assert.deepEqual(reopened.tabs().filter(tab => tab.groupId === 99).map(tab => tab.id), [14, 18, 17, 12, 11]);
  assert.deepEqual(reopened.groups.get(99), metadata);
});

test('an unrecorded emoji label is protected and does not establish ownership', async () => {
  const chrome = browser([
    tab(1, 'Existing', undefined, 7), tab(2, 'New A'), tab(3, 'New B'),
  ]);
  chrome.groups.get(7)!.title = '[🤖] example.com';
  const metadata = { ...chrome.groups.get(7)! };
  assert.deepEqual(await sortCurrentWindow('hostname', true, chrome.api, chrome.storage),
    { tabsSorted: 3, groupsCreated: 1 });
  assert.deepEqual(chrome.groups.get(7), metadata);
  assert.deepEqual(chrome.tabs().filter(tab => tab.groupId === 7).map(tab => tab.id), [1]);
  assert.deepEqual(chrome.calls.filter(call => call.operation === 'group').map(call => call.ids), [[2, 3]]);
  assert.ok(!chrome.calls.some(call => call.operation === 'expandGroup'));
});

test('mixed contents and duplicate recorded markers pause expansion without creating another group', async () => {
  const original = browser([tab(1, 'A'), tab(2, 'B')]);
  await sortCurrentWindow('hostname', true, original.api, original.storage);
  for (const duplicate of [false, true]) {
    const chrome = browser([
      tab(1, 'Member A', undefined, 42), tab(2, 'Member B', undefined, 42),
      ...(duplicate ? [tab(3, 'Duplicate', undefined, 43)] : []),
      tab(4, 'Arrival A'), tab(5, 'Arrival B'),
    ], new Map(original.records));
    chrome.groups.get(42)!.title = '[🤖] example.com';
    if (duplicate) chrome.groups.get(43)!.title = '[🤖] example.com';
    else chrome.tabs()[1].pendingUrl = 'https://other.example.com';
    const metadata = structuredClone([...chrome.groups]);
    assert.deepEqual(await sortCurrentWindow('hostname', true, chrome.api, chrome.storage),
      { tabsSorted: duplicate ? 5 : 4, groupsCreated: 0 });
    assert.deepEqual([...chrome.groups], metadata);
    assert.ok(!chrome.calls.some(call => call.operation === 'group' || call.operation === 'expandGroup'));
    for (const id of [4, 5]) assert.equal(chrome.tabs().find(tab => tab.id === id)?.groupId, -1);
    if (duplicate) chrome.groups.get(43)!.title = 'Manual';
    else delete chrome.tabs().find(tab => tab.id === 2)!.pendingUrl;
    await sortCurrentWindow('hostname', true, chrome.api, chrome.storage);
    assert.deepEqual(chrome.calls.filter(call => call.operation === 'expandGroup').map(call => call.ids), [[4, 5]]);
    assert.ok(chrome.tabs().filter(tab => tab.id === 4 || tab.id === 5).every(tab => tab.groupId === 42));
    assert.ok(!chrome.calls.some(call => call.operation === 'group'));
  }
});

test('removing the ownership label protects a previously generated group', async () => {
  const original = browser([tab(1, 'A'), tab(2, 'B')]);
  await sortCurrentWindow('hostname', true, original.api, original.storage);
  const chrome = browser([
    ...original.tabs(), tab(3, 'Arrival'),
  ], new Map(original.records));
  const metadata = { title: 'example.com', color: 'blue', collapsed: true };
  chrome.groups.set(100, { ...metadata });
  assert.deepEqual(await sortCurrentWindow('hostname', true, chrome.api, chrome.storage),
    { tabsSorted: 3, groupsCreated: 0 });
  assert.equal(chrome.tabs().find(tab => tab.id === 3)?.groupId, -1);
  assert.deepEqual(chrome.groups.get(100), metadata);
  assert.ok(!chrome.calls.some(call => call.operation === 'group' || call.operation === 'expandGroup'));
});

test('naming and ownership-storage failures are reported without recording false ownership', async () => {
  for (const failNaming of [true, false]) {
    const chrome = browser([tab(1, 'A'), tab(2, 'B')]);
    if (failNaming) chrome.api.tabGroups.update = async () => { throw new Error('Naming failed'); };
    else chrome.storage.setItem = () => { throw new Error('Storage failed'); };
    await assert.rejects(sortCurrentWindow('hostname', true, chrome.api, chrome.storage),
      failNaming ? /Naming failed/ : /Storage failed/);
    assert.equal(chrome.records.size, 0);
  }
});

test('site metadata supplies bounded labels with hostname fallback and no page-title guessing', async () => {
  for (const [site, expected] of [
    [{ og: '  GitHub\n ', app: 'Wrong app' }, 'GitHub'],
    [{ og: '  ', app: 'GitHub' }, 'GitHub'],
    [{ og: '\u202eGitHub\u2069' }, 'GitHub'],
    [{ og: 'x'.repeat(100) }, 'x'.repeat(80)],
    [{}, 'github.com'],
    [{ error: true }, 'github.com'],
    [{ og: 'Wrong site', host: 'other.com' }, 'github.com'],
  ] as const) {
    const chrome = browser([tab(1, 'Repository A', 'https://github.com/a'), tab(2, 'Repository B', 'https://github.com/b')]);
    chrome.metadata.set(1, site);
    await sortCurrentWindow('hostname', true, chrome.api, chrome.storage);
    assert.equal(chrome.groups.get(100)?.title, '[🤖] ' + expected);
    if (expected === 'GitHub') assert.deepEqual(chrome.reads, [1], 'Stop after finding a site name');
  }
  const chrome = browser([tab(1, 'First', 'https://github.com'), tab(2, 'Second', 'https://github.com')]);
  chrome.metadata.set(1, { error: true });
  chrome.metadata.set(2, { og: 'GitHub' });
  await sortCurrentWindow('hostname', true, chrome.api, chrome.storage);
  assert.equal(chrome.groups.get(100)?.title, '[🤖] GitHub');
  assert.deepEqual(chrome.reads, [1, 2], 'Try another member when the first cannot be read');
});

test('legacy groups are renamed without arrivals and friendly labels survive restored IDs', async () => {
  const records = new Map([['hostname-group:github.com', 'true']]);
  const chrome = browser([
    tab(4, 'Pinned', 'https://github.com', -1, true),
    tab(1, 'Repo A', 'https://github.com/a', 42), tab(2, 'Repo B', 'https://github.com/b', 42),
    tab(3, 'Manual', 'https://github.com', 7),
  ], records);
  const properties = { title: '[🤖] github.com', color: 'blue', collapsed: true };
  chrome.groups.set(42, { ...properties });
  chrome.metadata.set(1, { og: 'GitHub' });
  const manual = { ...chrome.groups.get(7)! };
  await sortCurrentWindow('hostname', true, chrome.api, chrome.storage);
  assert.deepEqual(chrome.groups.get(42), { ...properties, title: '[🤖] GitHub' });
  assert.deepEqual(chrome.groups.get(7), manual);
  assert.deepEqual(chrome.reads, [1], 'Never read pinned or protected tabs');
  assert.equal(chrome.tabs().find(tab => tab.id === 4)?.pinned, true);

  const restored = browser([
    tab(1, 'Repo A', 'https://github.com/a', 99), tab(2, 'Repo B', 'https://github.com/b', 99),
    tab(3, 'Arrival', 'https://github.com/c'),
  ], new Map(records));
  const named = { ...properties, title: '[🤖] GitHub' };
  restored.groups.set(99, { ...named });
  await sortCurrentWindow('hostname', true, restored.api, restored.storage);
  assert.deepEqual(restored.groups.get(99), named, 'Unavailable metadata does not undo an existing friendly name');
  assert.deepEqual(restored.calls.filter(call => call.operation === 'expandGroup').map(call => call.ids), [[3]]);
  assert.ok(restored.tabs().every(tab => tab.groupId === 99));
});

test('shared site names keep exact hostnames separate and preserve ambiguity safeguards', async () => {
  const original = browser([
    tab(1, 'Main A', 'https://github.com/a'), tab(2, 'Main B', 'https://github.com/b'),
    tab(3, 'Docs A', 'https://docs.github.com/a'), tab(4, 'Docs B', 'https://docs.github.com/b'),
  ]);
  for (const id of [1, 3]) original.metadata.set(id, { og: 'GitHub' });
  await sortCurrentWindow('hostname', true, original.api, original.storage);
  assert.equal(original.groups.get(100)?.title, '[🤖] GitHub');
  assert.equal(original.groups.get(101)?.title, '[🤖] GitHub');
  const restored = browser([
    ...original.tabs(), tab(5, 'Main arrival', 'https://github.com/c'), tab(6, 'Docs arrival', 'https://docs.github.com/c'),
  ], new Map(original.records));
  for (const id of [100, 101]) restored.groups.set(id, { ...original.groups.get(id)! });
  await sortCurrentWindow('hostname', true, restored.api, restored.storage);
  assert.equal(restored.tabs().find(tab => tab.id === 5)?.groupId, 100);
  assert.equal(restored.tabs().find(tab => tab.id === 6)?.groupId, 101);

  for (const issue of ['mixed', 'duplicate', 'renamed', 'unrecorded'] as const) {
    const chrome = browser([
      tab(1, 'Member A', 'https://github.com/a', 42),
      tab(2, 'Member B', issue === 'mixed' ? 'https://other.com' : 'https://github.com/b', 42),
      ...(issue === 'duplicate' ? [tab(3, 'Duplicate', 'https://github.com', 43)] : []),
      tab(4, 'Arrival', 'https://github.com/c'),
    ], issue === 'unrecorded' ? new Map() : new Map(original.records));
    chrome.groups.get(42)!.title = issue === 'renamed' ? 'My GitHub' : '[🤖] GitHub';
    if (issue === 'duplicate') chrome.groups.get(43)!.title = '[🤖] GitHub';
    const before = structuredClone([...chrome.groups]);
    await sortCurrentWindow('hostname', true, chrome.api, chrome.storage);
    assert.deepEqual([...chrome.groups], before);
    assert.equal(chrome.tabs().find(tab => tab.id === 4)?.groupId, -1);
    assert.deepEqual(chrome.reads, [], 'Do not resolve names for protected or ambiguous groups');
  }
});

test('metadata reads exclude pending/discarded tabs and do not run when grouping is off', async () => {
  const chrome = browser([tab(1, 'A', 'https://github.com'), tab(2, 'B', 'https://github.com')]);
  chrome.tabs()[0].pendingUrl = 'https://github.com/loading';
  chrome.tabs()[1].discarded = true;
  for (const id of [1, 2]) chrome.metadata.set(id, { og: 'GitHub' });
  await sortCurrentWindow('hostname', true, chrome.api, chrome.storage);
  assert.deepEqual(chrome.reads, []);
  assert.equal(chrome.groups.get(100)?.title, '[🤖] github.com');
  delete chrome.tabs()[0].pendingUrl;
  chrome.tabs()[1].discarded = false;
  await sortCurrentWindow('hostname', false, chrome.api, chrome.storage);
  await sortCurrentWindow('title', true, chrome.api, chrome.storage);
  assert.deepEqual(chrome.reads, []);
});

test('failed label persistence leaves existing names intact and failed naming does not establish ownership', async () => {
  const chrome = browser([tab(1, 'A', 'https://github.com', 42), tab(2, 'B', 'https://github.com', 42)],
    new Map([['hostname-group:github.com', 'true']]));
  chrome.groups.get(42)!.title = '[🤖] github.com';
  chrome.metadata.set(1, { og: 'GitHub' });
  chrome.storage.setItem = () => { throw new Error('Storage failed'); };
  await assert.rejects(sortCurrentWindow('hostname', true, chrome.api, chrome.storage), /Storage failed/);
  assert.equal(chrome.groups.get(42)?.title, '[🤖] github.com');

  const fresh = browser([tab(1, 'A', 'https://github.com'), tab(2, 'B', 'https://github.com')]);
  fresh.metadata.set(1, { og: 'GitHub' });
  fresh.api.tabGroups.update = async () => { throw new Error('Naming failed'); };
  await assert.rejects(sortCurrentWindow('hostname', true, fresh.api, fresh.storage), /Naming failed/);
  assert.equal(fresh.records.size, 0);
});
