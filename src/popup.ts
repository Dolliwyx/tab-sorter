import { sortCurrentWindow } from './sort.ts';
import type { SortMode } from './sort.ts';

const form = document.querySelector<HTMLFormElement>('#sort-form')!;
const mode = document.querySelector<HTMLSelectElement>('#sort-mode')!;
const grouping = document.querySelector<HTMLInputElement>('#group-hostname')!;
const button = document.querySelector<HTMLButtonElement>('#sort-button')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const hint = document.querySelector<HTMLParagraphElement>('#group-hint')!;
const available = typeof chrome !== 'undefined' && !!chrome.tabs?.query;

mode.value = localStorage.getItem('sort-mode') === 'hostname' ? 'hostname' : 'title';
grouping.checked = localStorage.getItem('group-hostname') === 'true';

function updateGrouping() {
  grouping.disabled = mode.value !== 'hostname';
  hint.textContent = grouping.disabled
    ? 'Choose hostname sorting to create groups.'
    : 'Group 2+ ungrouped tabs with the same hostname.';
}

mode.addEventListener('change', () => {
  localStorage.setItem('sort-mode', mode.value);
  updateGrouping();
});
grouping.addEventListener('change', () => {
  localStorage.setItem('group-hostname', String(grouping.checked));
});
updateGrouping();

if (!available) {
  button.disabled = true;
  status.textContent = 'Preview only. Open the Chrome toolbar popup to sort tabs.';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!available || button.disabled) return;
  const sortMode: SortMode = mode.value === 'hostname' ? 'hostname' : 'title';
  const groupByHostname = sortMode === 'hostname' && grouping.checked;
  button.disabled = true;
  mode.disabled = true;
  grouping.disabled = true;
  button.textContent = 'Sorting…';
  status.textContent = '';
  delete status.dataset.error;

  try {
    // ponytail: popup lifetime; use a service worker if sorting must survive closing it.
    const { tabsSorted, groupsCreated } = await sortCurrentWindow(sortMode, groupByHostname);
    status.textContent = tabsSorted === 0
      ? 'No unpinned tabs to sort.'
      : `Sorted ${tabsSorted} ${tabsSorted === 1 ? 'tab' : 'tabs'}.`;
    if (groupsCreated) status.textContent += ` Created ${groupsCreated} ${groupsCreated === 1 ? 'group' : 'groups'}.`;
  } catch (error) {
    status.dataset.error = 'true';
    const message = error instanceof Error ? error.message : 'Chrome could not finish sorting.';
    status.textContent = `Sorting stopped; some tabs may already have moved. ${message} Try again when tabs stop changing.`;
  } finally {
    button.disabled = false;
    mode.disabled = false;
    button.textContent = 'Sort tabs';
    updateGrouping();
  }
});
