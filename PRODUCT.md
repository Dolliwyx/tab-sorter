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
- Existing groups retain their members, names, colors, and collapsed state; tabs sort inside them and groups move as intact blocks ordered by their first sorted tab.
- Hostname grouping is optional and only applies to unpinned, ungrouped HTTP(S) tabs. New groups require at least two matching tabs; a single matching tab can join a recognized existing hostname group.
- Generated groups use an emoji-first title (`[🤖] example.com`) and locally recorded hostnames for ownership recognition across browser restarts. Older unmarked groups are not adopted. A user-created group with an identical recorded label cannot be distinguished from a generated group.
- Expansion pauses when existing members no longer all match the group's hostname or multiple groups in the current window share its recorded label. Matching arrivals remain ungrouped rather than creating another group.
- Removing the ownership label or clearing extension data removes recognition; no new permissions or background listeners are required.
- Browser/internal pages remain ungrouped.
- Hostnames ignore path and protocol but retain subdomains.

## Product Principles

- Preserve manual organization and pinned tabs.
- Make scope and grouping explicit before changing tab order.
- Use Chrome's native tab and group APIs with a small, dependency-free runtime.
