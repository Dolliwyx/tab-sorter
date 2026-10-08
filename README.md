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
- Existing groups retain their members, color, and collapsed state. Protected groups also retain their title; recognized Tab Sorter groups may receive a resolved site name during hostname grouping. After pinned tabs, manual/protected groups come first, recognized Tab Sorter groups second, and ungrouped tabs last, in both sort modes and regardless of the grouping toggle. Ambiguous or mismatched groups receive protected-group priority. Tabs sort within each group; groups move as whole blocks, ordered within their priority section by their first sorted tab. Ungrouped tabs also sort within their section, so the entire tab strip may not be globally alphabetical.
- Hostname sorting ignores protocols, ports, and paths. Subdomains stay separate. Tabs sharing a hostname sort by title; titles use case-insensitive natural order (`Tab 2` before `Tab 10`). Ties preserve the previous order.
- Optional grouping creates groups for **2+ unpinned, ungrouped HTTP(S) tabs** with the same exact hostname, named with site metadata, such as `[🤖] GitHub`. Names come from `og:site_name`, then `application-name`, in an accessible member tab; missing metadata falls back to the hostname. Names are whitespace-normalized and limited to 80 characters. Matching tabs join a recognized Tab Sorter group instead, even when only one new tab matches. Unmarked groups and their existing members are never regrouped. Singletons without a recognized group, browser pages, files, and invalid URLs stay ungrouped; pages without an HTTP(S) hostname sort before website tabs within the same priority section in hostname mode.
- Ownership uses the `[🤖] ` title prefix plus locally recorded hostname/label associations, not Chrome's session-scoped group IDs. Grouping still uses exact hostnames, even when different hostnames resolve to the same site name. Records survive browser restarts and extension reloads while extension data is retained. Previously recorded hostname labels remain recognized and receive site names on the next hostname-grouping run, even without new arrivals. An existing friendly name is kept when metadata cannot be read. Older unmarked groups are not adopted; removing the label or clearing extension data removes recognition. A user-created group with the same recorded hostname and label is indistinguishable from a generated group.
- Expansion and renaming pause if a recognized group's members do not identify one recorded hostname, or multiple groups in the current window match the same recorded hostname. New matching tabs remain ungrouped until the ambiguity or mismatched contents are resolved; existing members and group metadata stay unchanged.
- The popup remembers your choices and hostname/label associations locally. Nothing is uploaded; metadata is read from open tabs only when grouping. Pending and discarded tabs are not read. There are no persistent content scripts, network lookups, background polling, or automatic tab-change listeners.
- Keep the popup open until sorting finishes, and avoid dragging, closing, or pinning tabs during sorting. Chrome may reject operations if tabs change mid-sort; the popup reports a failure and any already-completed changes remain. Sorting does not close tabs or navigate pages.

## Development

```sh
pnpm test    # Node's built-in test runner; no test framework
pnpm check   # TypeScript checking
pnpm watch   # Rebuild dist/ on changes; reload the extension in Chrome
pnpm dev     # Browser preview only: Chrome APIs are unavailable on localhost
```

Vite copies `public/manifest.json` into `dist/` and bundles `index.html` with its TypeScript and CSS. No extension build plugin or service worker is needed for on-demand actions.

Permissions: `tabs` reads tab titles and URLs; `tabGroups` allows reading, moving, and naming groups. `scripting` and required HTTP(S) host permissions allow on-demand site-name metadata reads from open tabs. Chrome may ask you to approve the additional website access after reloading or updating the extension. Ownership records use extension-local `localStorage`; no storage permission is needed.
