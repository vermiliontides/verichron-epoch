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
| `text-label` | 0.75rem / 500 | UI chrome: form labels, tab/filter labels, panel sub-headings (e.g. a card's own `<h3>` inside a page that already has its `text-display` title), uppercase eyebrow text, **and button text** (see EPOCH-203 / `Button.tsx` — a button's label is UI chrome, not content). |
| `text-data` | 0.8125rem / 400 | Actual content — table cells, timestamps, IDs, badge-adjacent values, log lines. This is the default for anything that isn't a heading or a form label. |

`text-2xs` (0.65rem, defined separately in `@theme`) stays as-is for
`Badge.tsx`'s compact mono badges — it is a deliberate exception for a
single dense component, not a 4th tier of the scale above. Don't reach
for it elsewhere; use `text-label` or `text-data` instead.

We are explicitly **not** adding a 4th tier right now. If a real gap
shows up during 202/203/204/301, raise it as its own ticket rather than
inventing an ad hoc size in place.

## 3. Spacing scale — 4px grid, with one named exception

Unlike elevation and type scale, Tailwind's default spacing utilities
are **not a closed set we redefine in `index.css`** — `px-2.5` (10px)
and `px-3` (12px) are equally valid Tailwind utilities with nothing in
the CSS itself marking one as wrong. The rule below is a team
convention layered on top of an open scale, not a token boundary, which
is exactly why it has to be written down here rather than inferred from
a diff: there is nothing to check it against otherwise.

**Default rule:** padding and margin utilities (`p-*`, `px-*`, `py-*`,
`pt-*`/`pr-*`/`pb-*`/`pl-*`, and the `m-*` family) use only values on
the 4px grid — `1` (4px), `2` (8px), `3` (12px), `4` (16px), `5` (20px),
`6` (24px), and so on. Half-steps (`1.5`/6px, `2.5`/10px, `3.5`/14px)
are **not** used for padding or margin. This applies to card padding,
button padding, and vertical rhythm between stacked elements alike.

**Named exception — icon-to-label gap:** `gap-1.5` (6px) is the
sanctioned spacing between a leading icon and its adjacent text label
*within a single inline control* (a button's icon + text, a status
row's icon + message). This is the same shape of carve-out as
`text-2xs` in §2 above — a named, bounded exception, not a loophole.
Icon glyphs and text don't share the same optical bounding box the way
two lines of text do, so a whole-grid `gap-2` (8px) can visibly
under-hug an icon against its label in a way `gap-2` between two text
elements never does. The exception is narrow:

- Applies to: icon + label pairs inside one control (a button, a status
  line, a badge-adjacent icon).
- Does **not** apply to: spacing between distinct controls, card
  sections, list items, or anything else that isn't a single
  icon-to-text pairing. Those stay on-grid.
- `gap-1.5` is the one sanctioned half-step value for this case — don't
  introduce other half-steps (`gap-2.5`, `gap-3.5`) under this
  exception's umbrella.

**Why not encode this in `index.css` instead:** restricting Tailwind's
generated spacing scale at the token level (so `px-2.5` simply doesn't
exist) is a legitimate future option, but it's a repo-wide decision
affecting every spacing utility in the app, not just the components
this pass touches, and it forecloses the icon-gap exception above
without an arbitrary-value escape hatch. Not doing that here; this
section is the enforcement mechanism for now, the same way §1 and §2
are enforced by code review against a written rule rather than by a
lint rule.

## 4. Token structure — dark-only today, light/dark-ready by design

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

## 5. Per-component migration status (this pass)

| Component | Elevation fix | Type-scale fix | Spacing fix |
|---|---|---|---|
| `RunsView.tsx` | Yes — stage cards mixed `border` + Tailwind default `shadow-md`, neither of which is our token | Yes — header | Not yet audited against §3 |
| `IocsView.tsx` | Yes — indicator cards used flat `border-border`/`border-flag` | Yes — header | Not yet audited against §3 |
| `ReportsView.tsx` | Yes — every panel (error, empty states, report container) used flat `border-border` | Yes — header | Not yet audited against §3 |
| `RecordsView.tsx` | No change needed | Yes — header | Not yet audited against §3 |
| `WorkspaceView.tsx` | No change needed (already elevation-only; dashed drop-zone border is a legitimate functional exception) | No change needed (`<h1>` already correct) | Not yet audited against §3 — known half-steps remain (e.g. modal `px-3.5`/`py-2.5`, several `gap-3.5`/`gap-2.5` outside the icon-label exception) |
| `DevicePullPanel.tsx` | No change needed (functional/input borders only) | **Discrepancy:** this table previously said "Yes — internal `<h3>` sub-headings moved to `text-label`", but the file as currently pushed still shows `text-base font-semibold` on that heading. Needs reconciling — either the fix hasn't landed or this row was marked done prematurely. | Yes — padding/margin normalized to the §3 grid (confirmed by diff against the pre-202 version) |
| `Button.tsx` (EPOCH-203) | N/A (not a panel container) | Yes — `text-label` adopted for all button text per §2's row above | **Not yet** — `compoundVariants` still use `px-4 py-2.5` (default) / `px-3 py-1.5` (sm), both half-steps outside this section's icon-label exception (this is padding, not an icon gap). Needs correcting to `px-4 py-3` / `px-3 py-2` to match `DevicePullPanel.tsx`'s already-landed grid. |