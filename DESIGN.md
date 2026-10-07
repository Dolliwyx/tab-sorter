---
name: Tab Sorter
description: Minimal native Chrome toolbar popup.
colors:
  text: "light-dark(#24332e, #e6eee9)"
  background: "light-dark(#f8faf8, #18221d)"
  muted: "light-dark(#53665c, #afc2b5)"
  line: "light-dark(#bccbc0, #52685a)"
  accent: "light-dark(#23633f, #a7dfb8)"
  on-accent: "light-dark(#ffffff, #122d1b)"
  control-background: "light-dark(#fff, #233128)"
  accent-hover: "light-dark(#174c2d, #bcecca)"
  error: "light-dark(#9b302a, #ffb4aa)"
typography:
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  supporting:
    fontFamily: "system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: 1.5
  status:
    fontFamily: "system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.5
rounded:
  control: "6px"
spacing:
  paragraph: "6px"
  label-gap: "8px"
  status-gap: "12px"
  footer-inset: "16px"
  group-gap: "20px"
  popup-inset: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  select:
    backgroundColor: "{colors.control-background}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    width: "100%"
---

# Design System: Tab Sorter

## Overview

**Creative North Star: "Minimal native Chrome popup"**

A user-approved compact utility with system typography, plain native controls, OS light/dark theming, and a green accent. This records the shipped implementation, not a new brand direction.

**Key Characteristics:**
- Native select and checkbox.
- Fixed narrow layout and full-width action.
- Flat surfaces, visible keyboard focus, quiet supporting text.

Review disposition: **SHIP**, no defects from `.impeccable/review/popup-light.png` and `popup-dark.png`. These are review evidence, not comps or shipping raster assets. `src/popup.css` is authoritative.

## Colors

### Primary
Green accent identifies the action, checkbox, keyboard outline, and text selection; on-accent supplies their contrasting foreground. Accent-hover is used only for the enabled button.

### Neutral
Background and text define the canvas. Muted colors support purpose, grouping hints, disabled checkbox labels, and footer. Line colors outline the select and separate the footer; control-background fills the select. Error colors identify failure status. Every `light-dark()` pair in frontmatter is ordered light, then dark; `color-scheme: light dark` follows the OS.

## Typography

One system stack throughout. Title is the sole heading; body covers purpose and controls. The sort label and action use the semibold label role; the checkbox label remains body weight. Supporting text serves grouping hints and footer; status has its own intermediate size. Controls inherit the body font and line height; no custom font assets.

## Layout

Body width is 320px, with zero margin and a 24px main inset (272px content width). Header bottom spacing is 24px; label gap is 8px. Grouping block margins are 20px above and 24px below; checkbox label gap is 8px, with a 24px hint indent. Select and button are full width with 42px minimum height. Footer has a 20px top margin and 16px top inset. This is a desktop extension popup, with no responsive breakpoints.

## Elevation & Depth

No shadows, gradients, or animated transitions. Depth comes only from control fill, borders, and the footer separator.

## Shapes

Select and action use a 6px radius. The select and footer separator use 1px borders. The checkbox is native, sized 16px square; its browser-rendered shape is not a custom radius token.

## Components

- **Select:** native Title/Hostname options, inherited text, control fill, line border; no custom hover or active treatment.
- **Checkbox:** native accent-colored input with a body-weight label. Disabled labels become muted with default cursor; the browser owns the disabled input appearance. Hint uses supporting type. Title sorting disables grouping; hostname sorting makes it available.
- **Action:** accent fill, on-accent text, no border. Enabled hover uses accent-hover; disabled state has default cursor and opacity 0.65. No custom active state.
- **Focus and selection:** every focus-visible element gets a 2px solid accent outline, offset 3px. Selection uses accent and on-accent.
- **Status:** polite, atomic live region; empty status is hidden. Nonempty status has 12px top margin and wraps anywhere; error status uses error color, normal status inherits text.
- **Footer:** muted supporting text with a line-colored separator; no enclosing card.

## Do's and Don'ts

### Do:
- Do retain the 320px popup, 24px inset, and native controls.
- Do follow OS light/dark colors and preserve visible keyboard focus.

### Don't:
- Don't introduce custom fonts, decorative brand requirements, or raster artwork.
- Don't replace the flat popup with cards, shadows, or animated controls.
