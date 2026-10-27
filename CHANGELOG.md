# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-27

### Added

- Sort and group tabs immediately with Alt+Shift+S (Option+Shift+S on macOS), using saved settings even when the popup is closed. Failed shortcut runs show a toolbar error badge.
- Optionally group a domain and its subdomains together, respecting public and private suffixes while keeping exact-hostname grouping as the default.
- Recognize Tab Sorter groups across browser restarts and extension reloads, and add matching new tabs to them without changing manual groups.
- Name generated groups using site metadata, with hostname or domain fallbacks. Chrome may request additional website access for on-demand metadata reads.

### Changed

- Sort protected groups first, recognized Tab Sorter groups second, and ungrouped tabs last, preserving group membership, color, and collapsed state.
- Run sorting in a background service worker so closing the popup does not interrupt it. Concurrent sort requests do not start overlapping runs.
- Store settings and group ownership in extension-local storage shared by the popup and keyboard shortcut. After upgrading, open the popup once to migrate older localStorage data; until then, shortcuts use default settings and treat older groups as protected.
- Batch tab moves and storage reads to reduce work during sorting.

### Fixed

- Avoid reading site metadata from pending, discarded, or frozen tabs.
- Protect ambiguous or mismatched groups from expansion and renaming, including groups competing for the same domain.
- Wait for settings to persist before sorting, and report save failures instead of silently using stale settings.

## [0.1.0] - 2026-10-07

### Added

- Chrome extension popup for sorting the current window's tabs by title or hostname, with case-insensitive natural title ordering and stable ties.
- Optional grouping of matching HTTP(S) hostnames with at least two eligible tabs.
- Preserve pinned tabs, existing group membership, and tabs in other windows.

[Unreleased]: https://github.com/Dolliwyx/tab-sorter/compare/6d63cd276e018dfd3ed5012c24712b60acae9eec...HEAD
[0.2.0]: https://github.com/Dolliwyx/tab-sorter/compare/5d373bf...6d63cd276e018dfd3ed5012c24712b60acae9eec
[0.1.0]: https://github.com/Dolliwyx/tab-sorter/commit/5d373bf
