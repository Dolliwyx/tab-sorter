---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/popup.css","src/popup.ts"]
---

# Toolbar popup

Mode: Operate. A compact current-window Chrome tab-organizing control. Code-led; no artwork or comp.

## Direction contract

THESIS: Choose a sort key, optionally group matching hostnames, and act once. No tab dashboard or background automation.

OWN-WORLD: Native browser controls, system typography, a quiet green accent, light/dark surfaces following the OS. Explicit scope and preserved-tab guidance stay legible.

STORY: The user selects Title or Hostname, sees whether grouping is available, clicks Sort tabs, and receives success, empty, or actionable failure feedback.

FIRST VIEWPORT: A 320px popup with 24px inset. Heading and one-line purpose; labeled full-width sort select; hostname checkbox and helper text; one full-width action; status; a separated scope note. Keyboard focus is visible, and grouping eligibility changes immediately with the sort key.

FORM: The user-approved compact popup sketch, implemented directly. A pinned narrow structure, not a concept tournament; no seed or alternate visual world.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Verification

The shipped surface is a desktop extension popup, not a mobile page. Inspect light and dark at 320px; verify native controls, visible focus, error recovery, and no horizontal overflow. No shipping raster assets.
