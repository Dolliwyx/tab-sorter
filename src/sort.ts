export type SortMode = 'title' | 'hostname';
type Tab = chrome.tabs.Tab & { id: number };
const groupPrefix = '[🤖] ';
const ownershipPrefix = 'hostname-group:';
const labelPrefix = 'hostname-group-label:';

function labelHosts(storage: Pick<Storage, 'getItem'>, label: string): string[] {
  const value: unknown = JSON.parse(storage.getItem(labelPrefix + label) || '[]');
  if (!Array.isArray(value) || !value.every(host => typeof host === 'string')) {
    throw new Error('Invalid saved group label.');
  }
  return value;
}

async function siteName(tabs: chrome.tabs.Tab[], host: string, api: typeof chrome): Promise<string> {
  for (const tab of tabs) {
    if (tab.id === undefined || tab.pinned || tab.discarded || tab.pendingUrl) continue;
    try {
      const [injection] = await api.scripting.executeScript({
        target: { tabId: tab.id },
        injectImmediately: true,
        func: () => {
          for (const selector of ['meta[property="og:site_name"], meta[name="og:site_name"]', 'meta[name="application-name"]']) {
            const name = document.querySelector<HTMLMetaElement>(selector)?.content
              .replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 80);
            if (name) return { host: location.hostname, name };
          }
          return { host: location.hostname, name: '' };
        },
      });
      if (injection?.result?.host === host && typeof injection.result.name === 'string' && injection.result.name) {
        return injection.result.name;
      }
    } catch {
      // Unloaded, restricted or closed tabs must not prevent sorting.
    }
  }
  return '';
}

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
    const groups = tabs.some(tab => !tab.pinned) ? await api.tabGroups.query({ windowId: tabs[0].windowId }) : [];
    const existing = new Map<string, number | null>();
    // ponytail: fixed labels can be copied; use unique markers if strict provenance is needed.
    for (const group of groups) {
      if (!group.title?.startsWith(groupPrefix)) continue;
      const label = group.title.slice(groupPrefix.length);
      const hosts = [...new Set([label, ...labelHosts(storage, label)])]
        .filter(host => storage.getItem(ownershipPrefix + host) === 'true');
      const members = tabs.filter(tab => tab.groupId === group.id);
      const eligible = hosts.filter(host => members.length > 0 && members.every(tab =>
        !tab.pinned && tab.id !== undefined && hostname(tab) === host));
      // A shared site name is safe only when members identify one exact hostname.
      for (const host of eligible.length ? eligible : hosts) {
        existing.set(host, existing.has(host) || !eligible.length ? null : group.id);
      }
    }
    const recordLabel = (host: string, label: string) => {
      if (label === host) return;
      const hosts = labelHosts(storage, label);
      if (!hosts.includes(host)) storage.setItem(labelPrefix + label, JSON.stringify([...hosts, host]));
    };
    for (const [host, groupId] of existing) {
      if (groupId === null) continue;
      const members = tabs.filter(tab => tab.groupId === groupId);
      const name = await siteName(members, host, api);
      if (!name || groupPrefix + name === groups.find(group => group.id === groupId)!.title) continue;
      // Record before renaming so a storage failure leaves the old label recognizable.
      recordLabel(host, name);
      await api.tabGroups.update(groupId, { title: groupPrefix + name });
    }
    for (const [host, tabIds] of candidates) {
      const groupId = existing.get(host);
      if (groupId === null) continue;
      if (groupId !== undefined) {
        await api.tabs.group({ groupId, tabIds });
      } else if (tabIds.length >= 2) {
        const name = await siteName(tabs.filter(tab => tabIds.includes(tab.id!)), host, api) || host;
        const createdId = await api.tabs.group({ tabIds });
        await api.tabGroups.update(createdId, { title: groupPrefix + name });
        recordLabel(host, name);
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
