# Tab Sorter

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript, Vite, and pnpm. A Chrome Manifest V3 extension with no UI framework or runtime dependencies.

## Users

The user wants to organize their Chrome tabs without moving pinned tabs or replacing manual groups.

## Product Purpose

Sort tabs on demand by title or exact hostname, optionally grouping ungrouped tabs by hostname.

## Operating Context

A toolbar popup acts on the current Chrome window only. The built extension loads unpacked from `dist/`.

## Capabilities and Constraints

- Title and hostname sorting are ascending.
- Sorting is on demand, not event-driven.
- Pinned tabs remain untouched.
- Existing groups retain their members, colors, and collapsed state; protected group names remain unchanged. Recognized Tab Sorter groups may receive a resolved site name during hostname grouping. After pinned tabs, manual/protected groups come first, recognized Tab Sorter groups second, and sorted ungrouped tabs last, in both sort modes regardless of the grouping toggle. Ambiguous or mismatched groups receive protected-group priority. Tabs sort inside groups, which move as intact blocks ordered within their priority section by their first sorted tab.
- Hostname grouping is optional and only applies to unpinned, ungrouped HTTP(S) tabs. New groups require at least two matching tabs; a single matching tab can join a recognized existing hostname group.
- Generated groups use an emoji-first site name (`[🤖] GitHub`), resolved on demand from open-tab metadata (`og:site_name`, then `application-name`), with a hostname fallback. Previously recognized hostname labels receive site names on the next hostname-grouping run, even without arrivals; existing friendly names survive unavailable metadata.
- Locally recorded hostname/label associations preserve ownership recognition across browser restarts. Identical site names do not merge different hostnames. Older unmarked groups are not adopted. A user-created group with an identical recorded hostname and label cannot be distinguished from a generated group.
- Expansion and renaming pause when existing members do not identify one recorded hostname or multiple groups in the current window match the same recorded hostname. Matching arrivals remain ungrouped rather than creating another group.
- Removing the ownership label or clearing extension data removes recognition. Required scripting and HTTP(S) website access permit on-demand metadata reads; no background listeners or network lookups are used.
- Browser/internal pages remain ungrouped.
- Hostnames ignore path and protocol but retain subdomains.

## Product Principles

- Preserve manual organization and pinned tabs.
- Make scope and grouping explicit before changing tab order.
- Use Chrome's native tab and group APIs with a small, dependency-free runtime.
