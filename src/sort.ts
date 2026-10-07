export type SortMode = 'title' | 'hostname';
type Tab = chrome.tabs.Tab & { id: number };

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

export async function sortCurrentWindow(mode: SortMode, groupByHostname: boolean, api = chrome) {
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
    for (const [title, tabIds] of candidates) {
      if (tabIds.length < 2) continue;
      const groupId = await api.tabs.group({ tabIds });
      await api.tabGroups.update(groupId, { title });
      groupsCreated++;
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
