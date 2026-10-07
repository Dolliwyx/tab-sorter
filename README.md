# Tab Sorter

A Chrome Manifest V3 extension that sorts tabs on demand in the current window. Built with TypeScript, Vite, and pnpm; no runtime dependencies.

## Build and load

Requires Node.js 22.18+ and pnpm.

```sh
pnpm install
pnpm build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and choose this project's `dist/` directory.
3. Pin **Tab Sorter** in Chrome's extensions menu and open its toolbar popup.
4. Choose **Title** or **Hostname**, optionally enable **Group by hostname**, then click **Sort tabs**.

## Behavior

- Pinned tabs are never moved or grouped. Other windows are never modified.
- Existing groups retain their members, title, color, and collapsed state. Tabs sort within each group; groups move as whole blocks, ordered by their first sorted tab. Preserving groups means the entire tab strip may not be globally alphabetical.
- Hostname sorting ignores protocols, ports, and paths. Subdomains stay separate. Tabs sharing a hostname sort by title; titles use case-insensitive natural order (`Tab 2` before `Tab 10`). Ties preserve the previous order.
- Optional grouping creates groups for **2+ ungrouped HTTP(S) tabs** with the same exact hostname. It never adds tabs to existing groups or replaces manual groups. New groups are named after the hostname. Singleton tabs, browser pages, files, and invalid URLs stay ungrouped; pages without an HTTP(S) hostname sort before website tabs in hostname mode.
- The popup remembers your choices locally. Nothing is uploaded; there are no content scripts, background polling, or automatic tab-change listeners.
- Keep the popup open until sorting finishes, and avoid dragging, closing, or pinning tabs during sorting. Chrome may reject operations if tabs change mid-sort; the popup reports a failure and any already-completed changes remain. Sorting does not close tabs or navigate pages.

## Development

```sh
pnpm test    # Node's built-in test runner; no test framework
pnpm check   # TypeScript checking
pnpm watch   # Rebuild dist/ on changes; reload the extension in Chrome
pnpm dev     # Browser preview only: Chrome APIs are unavailable on localhost
```

Vite copies `public/manifest.json` into `dist/` and bundles `index.html` with its TypeScript and CSS. No extension build plugin or service worker is needed for on-demand actions.

Permissions: `tabs` reads tab titles and URLs; `tabGroups` allows moving groups and naming new ones. No host permissions are requested.
