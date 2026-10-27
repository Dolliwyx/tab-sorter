import type { SortStorage } from './sort.ts';

export function extensionStorage(area = chrome.storage.local): SortStorage {
  return {
    async getItem(key) {
      const value: unknown = (await area.get(key))[key];
      return typeof value === 'string' ? value : null;
    },
    async setItem(key, value) {
      await area.set({ [key]: value });
    },
  };
}

export async function migrateStorage(legacy: Storage, area = chrome.storage.local) {
  const saved = await area.get(null);
  if (saved['local-storage-migrated']) return;
  const records: Record<string, string | boolean> = { 'local-storage-migrated': true };
  for (let i = 0; i < legacy.length; i++) {
    const key = legacy.key(i)!;
    if ((['sort-mode', 'group-hostname', 'group-scope'].includes(key) ||
      /^(hostname|domain)-group(-label)?:/.test(key)) && saved[key] === undefined) {
      records[key] = legacy.getItem(key)!;
    }
  }
  await area.set(records);
}
