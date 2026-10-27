import { getDomain } from 'tldts';

export type SortMode = 'title' | 'hostname';
export type GroupScope = 'hostname' | 'domain';
export interface SortStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void | Promise<void>;
}
type Tab = chrome.tabs.Tab & { id: number };
const groupPrefix = '[🤖] ';

function groupingKey(host: string, scope: GroupScope): string {
  return scope === 'domain' ? getDomain(host, { allowPrivateDomains: true }) || host : host;
}

function labelHosts(storage: SortStorage, label: string, scope: GroupScope): string[] {
  const value: unknown = JSON.parse(storage.getItem(`${scope}-group-label:` + label) || '[]');
  if (!Array.isArray(value) || !value.every(host => typeof host === 'string')) {
    throw new Error('Invalid saved group label.');
  }
  return value;
}

async function siteName(tabs: chrome.tabs.Tab[], host: string, scope: GroupScope, api: typeof chrome): Promise<string> {
  for (const tab of tabs) {
    if (tab.id === undefined || tab.pinned || tab.discarded || tab.frozen || tab.pendingUrl) continue;
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
      if (injection?.result?.host === hostname(tab) && groupingKey(hostname(tab), scope) === host &&
        typeof injection.result.name === 'string' && injection.result.name) {
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

function blocks(tabs: Tab[], mode: SortMode, managedGroups: Set<number>): Tab[][] {
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

  const priority = (tab: Tab) => tab.groupId === -1 ? 2 : managedGroups.has(tab.groupId) ? 1 : 0;
  for (const block of result) block.sort(compare);
  return result.sort((a, b) => priority(a[0]) - priority(b[0]) || compare(a[0], b[0]));
}

export async function sortCurrentWindow(
  mode: SortMode, groupByHostname: boolean, api = chrome,
  storage: SortStorage = localStorage,
  groupScope: GroupScope = 'hostname',
  windowId?: number,
) {
  const query = () => api.tabs.query(windowId === undefined ? { currentWindow: true } : { windowId });
  let tabs = await query();
  let groupsCreated = 0;

  const groups = tabs.some(tab => !tab.pinned && tab.groupId !== -1)
    ? await api.tabGroups.query({ windowId: tabs[0].windowId }) : [];
  const recognized = { hostname: new Map<string, number | null>(), domain: new Map<string, number | null>() };
  const domainGroups = new Set<number>();
  // Fixed labels can be copied; use unique markers if strict provenance is needed.
  for (const scope of ['domain', 'hostname'] as const) {
    for (const group of groups) {
      if (!group.title?.startsWith(groupPrefix)) continue;
      // Do not recognize promoted domain groups again through their legacy records.
      if (scope === 'hostname' && domainGroups.has(group.id)) continue;
      const label = group.title.slice(groupPrefix.length);
      const hosts = [...new Set([label, ...labelHosts(storage, label, scope)])]
        .filter(host => storage.getItem(`${scope}-group:` + host) === 'true');
      const members = tabs.filter(tab => tab.groupId === group.id);
      const eligible = hosts.filter(host => members.length > 0 && members.every(tab =>
        !tab.pinned && tab.id !== undefined && hostname(tab) && groupingKey(hostname(tab), scope) === host));
      if (scope === 'domain' && eligible.length) domainGroups.add(group.id);
      for (const host of eligible.length ? eligible : hosts) {
        recognized[scope].set(host, recognized[scope].has(host) || !eligible.length ? null : group.id);
      }
    }
  }
  const existing = new Map(recognized[groupScope]);
  if (groupScope === 'domain') {
    // Reuse one legacy hostname group, but never merge competing groups.
    for (const [host, id] of recognized.hostname) {
      const domain = groupingKey(host, 'domain');
      existing.set(domain, existing.has(domain) && existing.get(domain) !== id ? null : id);
    }
  }

  const managedGroups = new Set([
    ...existing.values(),
    ...(groupScope === 'hostname' ? recognized.domain.values() : []),
  ].filter((id): id is number => id !== null));

  if (mode === 'hostname' && groupByHostname) {
    const candidates = new Map<string, [number, ...number[]]>();
    for (const tab of tabs) {
      const host = groupingKey(hostname(tab), groupScope);
      if (tab.pinned || tab.groupId !== -1 || tab.id === undefined || !host) continue;
      const ids = candidates.get(host);
      if (ids) ids.push(tab.id);
      else candidates.set(host, [tab.id]);
    }
    const recordLabel = async (host: string, label: string) => {
      if (label === host) return;
      const hosts = labelHosts(storage, label, groupScope);
      if (!hosts.includes(host)) await storage.setItem(`${groupScope}-group-label:` + label, JSON.stringify([...hosts, host]));
    };
    for (const [host, groupId] of existing) {
      if (groupId === null) continue;
      const members = tabs.filter(tab => tab.groupId === groupId);
      const name = await siteName(members, host, groupScope, api);
      if (!name || groupPrefix + name === groups.find(group => group.id === groupId)!.title) continue;
      // Record before renaming so a storage failure leaves the old label recognizable.
      await recordLabel(host, name);
      if (groupScope === 'domain') await storage.setItem('domain-group:' + host, 'true');
      await api.tabGroups.update(groupId, { title: groupPrefix + name });
    }
    for (const [host, tabIds] of candidates) {
      const groupId = existing.get(host);
      if (groupId === null) continue;
      if (groupId !== undefined) {
        if (groupScope === 'domain') {
          const label = groups.find(group => group.id === groupId)!.title!.slice(groupPrefix.length);
          await recordLabel(host, label);
          await storage.setItem('domain-group:' + host, 'true');
        }
        await api.tabs.group({ groupId, tabIds });
      } else if (tabIds.length >= 2) {
        const name = await siteName(tabs.filter(tab => tabIds.includes(tab.id!)), host, groupScope, api) || host;
        const createdId = await api.tabs.group({ tabIds });
        await api.tabGroups.update(createdId, { title: groupPrefix + name });
        await recordLabel(host, name);
        await storage.setItem(`${groupScope}-group:` + host, 'true');
        managedGroups.add(createdId);
        groupsCreated++;
      }
    }
    // Grouping changes indices and membership; plan from Chrome's updated state.
    tabs = await query();
  }

  const movable = tabs.filter((tab): tab is Tab => !tab.pinned && tab.id !== undefined);
  let index = tabs.filter(tab => tab.pinned).length;

  // Place each whole block at the next group boundary, then sort only inside it.
  for (const block of blocks(movable, mode, managedGroups)) {
    if (block[0].groupId !== -1) {
      await api.tabGroups.move(block[0].groupId, { index });
    }
    await api.tabs.move(block.map(tab => tab.id), { index });
    index += block.length;
  }

  return { tabsSorted: movable.length, groupsCreated };
}
