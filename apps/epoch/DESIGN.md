# Verichron Epoch — Design Tokens & Visual Hierarchy

Source of truth for EPOCH-201 (VER-8) and every ticket downstream of it
(EPOCH-202/203/204/301). Nothing in those tickets should introduce a
pattern that contradicts this file. All tokens live in
`apps/epoch/src/renderer/index.css`.

## 1. Elevation, not borders

`shadow-elevation-{1,2,3}` is the only way a **panel-level container**
(card, page section, modal) expresses separation from the background.
Flat `border`/`border-*` utilities are reserved for two cases only:

- **Functional borders** — form inputs, textareas, anything with a focus
  ring. A shadow doesn't communicate "this is editable" the way a border
  does.
- **Structural dividers** — table row/column separators, `border-b`
  under a header, dashed drop-zone affordances. These separate content
  *within* a container, not the container from its background.

If you're adding `border` to something that reads as its own card/panel,
it's the wrong tool — use elevation.

| Tier | Use for |
|---|---|
| `shadow-elevation-1` | Resting state — page-level cards, static panels |
| `shadow-elevation-2` | Interactive/hover state, or a panel one level "up" from its siblings (e.g. a modal's card while the page behind it sits at tier 1) |
| `shadow-elevation-3` | Modals, overlays — anything floating above the whole page |

Do not mix `border` + `shadow-elevation-*` on the same container to
signal the same thing (accent-color left-borders like `RunsView`'s
status indicator are a different signal — state color, not elevation —
and can coexist with a shadow tier).

## 2. Type scale — three tiers, by role not by size

Each tier is a **composite** Tailwind v4 utility (`text-display`,
`text-label`, `text-data`) that carries font-size, line-height, and
font-weight together — never hand-combine `text-base` + `font-medium`
to approximate one of these; use the named class.

| Class | Size / weight | Use for |
|---|---|---|
| `text-display` | 1.25rem / 600 | The one heading per view/route — page titles. Every top-level section header in the sidebar-navigated views (`WorkspaceView`, `RunsView`, `IocsView`, `ReportsView`, `RecordsView`) is a page title in this sense, even though some render inside a shared shell — there is exactly one per view. |
| `text-label` | 0.75rem / 500 | UI chrome: form labels, tab/filter labels, panel sub-headings (e.g. a card's own `<h3>` inside a page that already has its `text-display` title), uppercase eyebrow text. |
| `text-data` | 0.8125rem / 400 | Actual content — table cells, timestamps, IDs, badge-adjacent values, log lines. This is the default for anything that isn't a heading or a form label. |

`text-2xs` (0.65rem, defined separately in `@theme`) stays as-is for
`Badge.tsx`'s compact mono badges — it is a deliberate exception for a
single dense component, not a 4th tier of the scale above. Don't reach
for it elsewhere; use `text-label` or `text-data` instead.

We are explicitly **not** adding a 4th tier right now. If a real gap
shows up during 202/203/204/301, raise it as its own ticket rather than
inventing an ad hoc size in place.

## 3. Token structure — dark-only today, light/dark-ready by design

A light theme is a confirmed future requirement (not speculative), so
tokens are structured now to make that a same-file addition later
rather than a second migration:

```css
:root {
  /* current dark values — this is the DEFAULT, not a "dark" override */
  --background: 217 17% 9%;
  --surface: 217 17% 14%;
  /* ...existing tokens, unchanged... */
}

/* Placeholder for the future toggle. Adding a light theme later means
   filling in this block — no restructuring of :root, no renaming of
   any token, no changes to any component. */
:root[data-theme="light"] {
  /* intentionally empty until EPOCH-XXX (light theme) */
}
```

Components must keep referencing the semantic token names
(`bg-background`, `text-foreground`, etc.) exactly as they do today —
never a raw HSL value or a hardcoded dark-specific assumption. That's
what makes the future toggle a CSS-only change.

## 4. Per-component migration status (this pass)

| Component | Elevation fix | Type-scale fix |
|---|---|---|
| `RunsView.tsx` | Yes — stage cards mixed `border` + Tailwind default `shadow-md`, neither of which is our token | Yes — header |
| `IocsView.tsx` | Yes — indicator cards used flat `border-border`/`border-flag` | Yes — header |
| `ReportsView.tsx` | Yes — every panel (error, empty states, report container) used flat `border-border` | Yes — header |
| `RecordsView.tsx` | No change needed | Yes — header |
| `WorkspaceView.tsx` | No change needed (already elevation-only; dashed drop-zone border is a legitimate functional exception) | No change needed (`<h1>` already correct) |
| `DevicePullPanel.tsx` | No change needed (functional/input borders only) | Yes — internal `<h3>` sub-headings moved to `text-label` |
