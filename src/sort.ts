export type SortMode = 'title' | 'hostname';
type Tab = chrome.tabs.Tab & { id: number };
const groupPrefix = '[🤖] ';
const ownershipPrefix = 'hostname-group:';

export function hostname(tab: Pick<chrome.tabs.Tab, 'url' | 'pendingUrl'>): string {
  try {
    const url = new URL(tab.pendingUrl || tab.url || '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.hostname : '';
  } catch {
    return '';
  }
}

function blocks(tabs: Tab[], mode: SortMode): Tab[][] {
  const compareText = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
  const compare = (a: Tab, b: Tab) =>
    (mode === 'hostname' ? compareText(hostname(a), hostname(b)) : 0) ||
    compareText(a.title || a.pendingUrl || a.url || '', b.title || b.pendingUrl || b.url || '') ||
    a.index - b.index;
  const grouped = new Map<number, Tab[]>();
  const result: Tab[][] = [];

  for (const tab of tabs) {
    if (tab.groupId === -1) {
      result.push([tab]);
    } else {
      let group = grouped.get(tab.groupId);
      if (!group) {
        group = [];
        grouped.set(tab.groupId, group);
        result.push(group);
      }
      group.push(tab);
    }
  }

  for (const block of result) block.sort(compare);
  return result.sort((a, b) => compare(a[0], b[0]));
}

export async function sortCurrentWindow(
  mode: SortMode, groupByHostname: boolean, api = chrome,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
) {
  const query = () => api.tabs.query({ currentWindow: true });
  let tabs = await query();
  let groupsCreated = 0;

  if (mode === 'hostname' && groupByHostname) {
    const candidates = new Map<string, [number, ...number[]]>();
    for (const tab of tabs) {
      const host = hostname(tab);
      if (tab.pinned || tab.groupId !== -1 || tab.id === undefined || !host) continue;
      const ids = candidates.get(host);
      if (ids) ids.push(tab.id);
      else candidates.set(host, [tab.id]);
    }
    const groups = candidates.size ? await api.tabGroups.query({ windowId: tabs[0].windowId }) : [];
    const existing = new Map<string, number | null>();
    // ponytail: fixed labels can be copied; use unique markers if strict provenance is needed.
    for (const group of groups) {
      if (!group.title?.startsWith(groupPrefix)) continue;
      const host = group.title.slice(groupPrefix.length);
      if (storage.getItem(ownershipPrefix + host) !== 'true') continue;
      const members = tabs.filter(tab => tab.groupId === group.id);
      const eligible = members.length > 0 && members.every(tab =>
        !tab.pinned && tab.id !== undefined && hostname(tab) === host);
      // Null pauses this hostname for mixed contents or ambiguous duplicate labels.
      existing.set(host, existing.has(host) || !eligible ? null : group.id);
    }
    for (const [host, tabIds] of candidates) {
      const groupId = existing.get(host);
      if (groupId === null) continue;
      if (groupId !== undefined) {
        await api.tabs.group({ groupId, tabIds });
      } else if (tabIds.length >= 2) {
        const createdId = await api.tabs.group({ tabIds });
        await api.tabGroups.update(createdId, { title: groupPrefix + host });
        storage.setItem(ownershipPrefix + host, 'true');
        groupsCreated++;
      }
    }
    // Grouping changes indices and membership; plan from Chrome's updated state.
    tabs = await query();
  }

  const movable = tabs.filter((tab): tab is Tab => !tab.pinned && tab.id !== undefined);
  let index = tabs.filter(tab => tab.pinned).length;

  // Place each whole block at the next group boundary, then sort only inside it.
  for (const block of blocks(movable, mode)) {
    if (block[0].groupId !== -1) {
      await api.tabGroups.move(block[0].groupId, { index });
    }
    for (const tab of block) {
      await api.tabs.move(tab.id, { index });
      index++;
    }
  }

  return { tabsSorted: movable.length, groupsCreated };
}
