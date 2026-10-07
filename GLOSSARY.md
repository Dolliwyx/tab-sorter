# Tab Sorter

Tab Sorter organizes tabs in one Chrome window while preserving pinned tabs and existing group members. Its own hostname groups may receive additional matching tabs.

## Language

**Current window**:
The Chrome window targeted by a sort operation, rather than every open window.
_Avoid_: All windows, browser session

**Pinned tab**:
A tab fixed in the window's pinned section and excluded from sorting and hostname grouping.

**Unpinned tab**:
A tab outside the pinned section, whether grouped or ungrouped.
_Avoid_: Ungrouped tab (when referring to pin status)

**Ungrouped tab**:
A tab that belongs to no tab group; being ungrouped does not imply being unpinned.

**Existing group**:
A tab group already present when a sort operation begins, regardless of who or what created it.
_Avoid_: Manual group (when referring to all existing groups)

**Hostname**:
The host name of an HTTP or HTTPS page, excluding its protocol, port, path, query, and fragment. Subdomains are distinct hostnames: `docs.example.com` and `example.com` are different.
_Avoid_: Domain, site, origin

**Hostname group**:
A group recognized as Tab Sorter's own by its ownership label and a hostname for which Tab Sorter has previously created a group. New hostname groups start with at least two unpinned, ungrouped tabs sharing that exact hostname.
_Avoid_: Domain group

**Site name**:
A website's human-readable name used in a hostname group's title, with the hostname as a fallback. Different hostnames may share a site name without belonging to the same group.

**Ownership label**:
The fixed `[🤖]` prefix before a recorded site name or hostname in a group's title, indicating Tab Sorter ownership. It is an ownership convention, not proof of who created a group; removing it relinquishes recognition.

**Protected group**:
A tab group not recognized as Tab Sorter's own, even if its members share a hostname. Its membership is preserved rather than expanded by hostname grouping.
_Avoid_: Manual group (when excluding groups created by other tools)

**Group expansion**:
The addition of matching unpinned, ungrouped tabs to an existing hostname group while retaining its identity and existing members. A single matching tab is sufficient, but expansion is paused when existing members do not identify one recorded hostname or multiple groups in the current window match that hostname.
_Avoid_: Group creation, group merging

**Sort block**:
A unit of tab-strip ordering consisting of one entire tab group or one ungrouped, unpinned tab.
_Avoid_: Group (when the unit may be an ungrouped tab)

**Natural title order**:
Ascending title order that ignores case and treats numbers numerically, so `Tab 2` precedes `Tab 10`.
_Avoid_: Lexicographic order

**Title sorting**:
An ordering of sort blocks by their first tab after their members are placed in natural title order. It is not necessarily a globally alphabetical ordering of individual tabs.

**Hostname sorting**:
An ordering of sort blocks by their first tab after their members are ordered by hostname, then title. Tabs without an HTTP or HTTPS hostname precede website tabs.
_Avoid_: Domain sorting

**Hostname grouping**:
Optional organization of unpinned, ungrouped tabs by exact hostname during hostname sorting, through expansion of an existing hostname group or creation of a new one when none exists. New groups require at least two matching tabs; protected groups are not expanded.
_Avoid_: Merging groups, regrouping all tabs
