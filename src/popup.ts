import { extensionStorage, migrateStorage } from './storage.ts';
import type { SortStorage } from './sort.ts';

const form = document.querySelector<HTMLFormElement>('#sort-form')!;
const mode = document.querySelector<HTMLSelectElement>('#sort-mode')!;
const grouping = document.querySelector<HTMLInputElement>('#group-hostname')!;
const scope = document.querySelector<HTMLSelectElement>('#group-scope')!;
const button = document.querySelector<HTMLButtonElement>('#sort-button')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const hint = document.querySelector<HTMLParagraphElement>('#group-hint')!;
const available = typeof chrome !== 'undefined' && !!chrome.tabs?.query;

let storage: SortStorage = localStorage;
let saving = Promise.resolve();
let saveError: unknown;

function save(key: string, value: string) {
  // Start the write before the popup can close; submission waits for all writes.
  saving = Promise.all([saving, storage.setItem(key, value)]).then(() => {}).catch(error => {
    saveError = error;
    status.dataset.error = 'true';
    status.textContent = 'Could not save settings. Reopen the popup and try again.';
    button.disabled = true;
  });
}

async function initialize() {
  button.disabled = true;
  mode.disabled = grouping.disabled = scope.disabled = true;
  if (available) {
    await migrateStorage(localStorage);
    storage = await extensionStorage();
  }
  mode.value = storage.getItem('sort-mode') === 'hostname' ? 'hostname' : 'title';
  grouping.checked = storage.getItem('group-hostname') === 'true';
  scope.value = storage.getItem('group-scope') === 'domain' ? 'domain' : 'hostname';
  mode.disabled = false;
  button.disabled = !available;
  updateGrouping();
}

function updateGrouping() {
  grouping.disabled = mode.value !== 'hostname';
  scope.disabled = grouping.disabled || !grouping.checked;
  hint.textContent = grouping.disabled
    ? 'Choose hostname sorting to group tabs.'
    : scope.value === 'domain'
      ? 'Combine subdomains. Create groups for 2+ tabs; add matches to Tab Sorter groups.'
      : 'Create groups for 2+ tabs; add matches to Tab Sorter groups.';
}

mode.addEventListener('change', () => {
  save('sort-mode', mode.value);
  updateGrouping();
});
grouping.addEventListener('change', () => {
  save('group-hostname', String(grouping.checked));
  updateGrouping();
});
scope.addEventListener('change', () => {
  save('group-scope', scope.value);
  updateGrouping();
});
updateGrouping();
void initialize().catch(() => {
  status.dataset.error = 'true';
  status.textContent = 'Could not load saved settings. Reopen the popup and try again.';
});

if (!available) {
  button.disabled = true;
  status.textContent = 'Preview only. Open the Chrome toolbar popup to sort tabs.';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!available || button.disabled) return;
  button.disabled = true;
  mode.disabled = true;
  grouping.disabled = true;
  scope.disabled = true;
  button.textContent = 'Sorting…';
  status.textContent = '';
  delete status.dataset.error;

  try {
    await saving;
    if (saveError) throw saveError;
    const { id: windowId } = await chrome.windows.getCurrent();
    const response = await chrome.runtime.sendMessage({ type: 'sort-tabs', windowId });
    if (response.error) throw new Error(response.error);
    const { tabsSorted, groupsCreated } = response.result;
    status.textContent = tabsSorted === 0
      ? 'No unpinned tabs to sort.'
      : `Sorted ${tabsSorted} ${tabsSorted === 1 ? 'tab' : 'tabs'}.`;
    if (groupsCreated) status.textContent += ` Created ${groupsCreated} ${groupsCreated === 1 ? 'group' : 'groups'}.`;
  } catch (error) {
    status.dataset.error = 'true';
    const message = error instanceof Error ? error.message : 'Chrome could not finish sorting.';
    status.textContent = `Sorting stopped; some tabs may already have moved. ${message} Try again when tabs stop changing.`;
  } finally {
    button.disabled = !!saveError;
    mode.disabled = false;
    button.textContent = 'Sort tabs';
    updateGrouping();
  }
});
