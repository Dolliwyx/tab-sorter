import { sortCurrentWindow } from './sort.ts';
import { extensionStorage } from './storage.ts';

let sorting = false;

async function sort(windowId?: number) {
  if (sorting) throw new Error('Sorting is already in progress.');
  sorting = true;
  try {
    // Capture the target before storage reads or a focus change during sorting.
    const target = windowId ?? (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
    if (target === undefined || target < 0) throw new Error('No browser window to sort.');
    const storage = extensionStorage();
    const mode = await storage.getItem('sort-mode') === 'hostname' ? 'hostname' : 'title';
    const grouping = await storage.getItem('group-hostname') === 'true';
    const scope = await storage.getItem('group-scope') === 'domain' ? 'domain' : 'hostname';
    return await sortCurrentWindow(mode, grouping, chrome, storage, scope, target);
  } finally {
    sorting = false;
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'sort-tabs' || sorting) return;
  void sort(tab?.windowId).then(
    () => chrome.action.setBadgeText({ text: '' }),
    async error => {
      console.error('Tab Sorter:', error);
      await chrome.action.setBadgeText({ text: '!' });
    },
  ).catch(console.error);
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'sort-tabs') return;
  if (!Number.isInteger(message.windowId) || message.windowId < 0) {
    respond({ error: 'Invalid browser window.' });
    return;
  }
  void sort(message.windowId).then(
    result => respond({ result }),
    error => respond({ error: error instanceof Error ? error.message : 'Chrome could not finish sorting.' }),
  );
  return true;
});
