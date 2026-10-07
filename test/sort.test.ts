import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostname, sortCurrentWindow } from '../src/sort.ts';

function tab(id: number, title: string, url = 'https://example.com', groupId = -1, pinned = false): chrome.tabs.Tab {
  return { id, title, url, groupId, pinned, index: 0, windowId: 1, active: false,
    highlighted: false, incognito: false, discarded: false, autoDiscardable: true, selected: false,
    frozen: false, lastAccessed: 0 };
}

// Model only the Chrome operations we use, enforcing pinned and group boundaries.
function browser(initial: chrome.tabs.Tab[]) {
  let tabs = initial.map((tab, index) => ({ ...tab, index }));
  const groups = new Map(initial.filter(tab => tab.groupId !== -1).map(tab => [tab.groupId,
    { title: 'Manual', color: 'blue', collapsed: true }]));
  const calls: { operation: string; ids: number[] }[] = [];
  let nextGroup = 100;
  const reindex = () => tabs.forEach((tab, index) => { tab.index = index; });
  const boundary = (index: number) => {
    assert.ok(index >= tabs.filter(tab => tab.pinned).length, 'Never move before pinned tabs');
    if (index > 0 && index < tabs.length) {
      assert.ok(tabs[index - 1].groupId === -1 || tabs[index - 1].groupId !== tabs[index].groupId,
        'Never insert a block inside another group');
    }
  };
  const api = {
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
      async group({ tabIds }: { tabIds: number[] }) {
        const members = tabs.filter(tab => tabIds.includes(tab.id!));
        assert.equal(members.length, tabIds.length);
        assert.ok(members.every(tab => !tab.pinned && tab.groupId === -1));
        const index = members[0].index;
        const groupId = nextGroup++;
        tabs = tabs.filter(tab => !tabIds.includes(tab.id!));
        boundary(index);
        tabs.splice(index, 0, ...members.map(tab => ({ ...tab, groupId })));
        groups.set(groupId, { title: '', color: 'grey', collapsed: false });
        reindex();
        calls.push({ operation: 'group', ids: tabIds });
        return groupId;
      },
    },
    tabGroups: {
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
        assert.ok(groupId >= 100, 'Never update manual group metadata');
        Object.assign(groups.get(groupId)!, properties);
      },
    },
  } as unknown as typeof chrome;
  return { api, calls, groups, tabs: () => tabs, ids: () => tabs.map(tab => tab.id) };
}

test('title sorting preserves pinned order, manual group membership and metadata, and ties', async () => {
  const chrome = browser([
    tab(1, 'Pinned Z', undefined, -1, true), tab(2, 'Pinned A', undefined, -1, true),
    tab(3, 'Zulu'), tab(4, 'Tab 10', undefined, 9), tab(5, 'Beta'),
    tab(6, 'Alpha', undefined, 8), tab(7, 'alpha', undefined, 8),
  ]);
  assert.deepEqual(await sortCurrentWindow('title', true, chrome.api), { tabsSorted: 5, groupsCreated: 0 });
  assert.deepEqual(chrome.ids(), [1, 2, 6, 7, 5, 4, 3]);
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
  assert.deepEqual(await sortCurrentWindow('hostname', true, chrome.api), { tabsSorted: 9, groupsCreated: 2 });
  assert.deepEqual(chrome.ids(), [1, 8, 7, 4, 3, 6, 5, 2, 10, 9]);
  assert.deepEqual(chrome.calls.filter(call => call.operation === 'group').map(call => call.ids), [[2, 5], [9, 10]]);
  assert.deepEqual(chrome.groups.get(7), { title: 'Manual', color: 'blue', collapsed: true });
  assert.equal(chrome.groups.get(100)?.title, 'example.com');
  assert.equal(chrome.groups.get(101)?.title, 'zzz.com');
  for (const id of [6, 7, 8]) assert.equal(chrome.tabs().find(tab => tab.id === id)?.groupId, -1);
  const before = chrome.ids();
  await sortCurrentWindow('hostname', true, chrome.api);
  assert.deepEqual(chrome.ids(), before, 'Repeated sorting is stable');
  assert.equal(chrome.calls.filter(call => call.operation === 'group').length, 2);
});

test('sorting without grouping uses natural title order and sorts inside intact blocks', async () => {
  const chrome = browser([
    tab(1, 'Zulu', 'https://zzz.com', 3), tab(2, 'Tab 10', 'https://aaa.com', 3),
    tab(3, 'Tab 2', 'https://aaa.com', 3), tab(4, 'Alpha', 'https://aaa.com'),
    tab(5, 'Beta', 'https://aaa.com'),
  ]);
  await sortCurrentWindow('hostname', false, chrome.api);
  assert.deepEqual(chrome.ids(), [4, 5, 3, 2, 1]);
  assert.ok(!chrome.calls.some(call => call.operation === 'group'));
  assert.ok(chrome.tabs().slice(2).every(tab => tab.groupId === 3));
  await sortCurrentWindow('title', false, chrome.api);
  assert.deepEqual(chrome.ids(), [4, 5, 3, 2, 1]);
});

test('empty and all-pinned windows are no-ops; Chrome failures propagate', async () => {
  for (const tabs of [[], [tab(1, 'Pinned', undefined, -1, true)]]) {
    const chrome = browser(tabs);
    assert.deepEqual(await sortCurrentWindow('hostname', true, chrome.api), { tabsSorted: 0, groupsCreated: 0 });
    assert.deepEqual(chrome.calls, []);
  }
  const chrome = browser([tab(1, 'A')]);
  chrome.api.tabs.move = (() => Promise.reject(new Error('Tab was closed'))) as unknown as typeof chrome.api.tabs.move;
  await assert.rejects(sortCurrentWindow('title', false, chrome.api), /Tab was closed/);
  assert.equal(hostname({ url: 'file:///tmp/example.com' }), '');
  assert.equal(hostname({ url: 'https://EXAMPLE.com/a' }), 'example.com');
});
