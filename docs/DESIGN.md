# WhyUs design system

The brief: high tech and expensive (the level of Linear, Stripe, Vercel, Perplexity); a
professional research tool, not a homework helper. Dark by default with a light option.
Restrained palette, one signature accent, premium typography, generous spacing. Smooth,
subtle motion. No stock illustrations, no emojis, no generic AI gradients or sparkle icons.

## Concept

**An instrument that produces briefings.** The app chrome is a precise research instrument:
Instrument Sans on cool graphite surfaces with hairline borders. What the instrument produces
(dossiers, quotes, angles) is a document: set in Newsreader, a reading serif with optical sizes.
Moving from tool to document is a deliberate change in typeface, and it is the signature move.

**Marker amber** (`--accent`, #f2b33d) is the one accent. It means three things only:
what is distinctive (uniqueness meters, the top-ranked details), what is live (research in
progress), and focus (focus rings, the single primary action on a screen). Never decorate with it.

## Tokens (see `src/app/globals.css`)

Use the Tailwind utilities generated from tokens; never hard-code colors.

| Role | Utility | Notes |
|---|---|---|
| Page | `bg-canvas` | graphite #0a0c10 (dark) / #f5f6f8 (light) |
| Panel | `bg-raised` + `shadow-raise` | panels are separated by hairlines, not drop shadows |
| Inset well | `bg-sunken` | inputs, code-like wells, log panes |
| Popover | `bg-overlay` + `shadow-pop` | menus, dialogs |
| Hover | `bg-hover` | row and button hover |
| Hairline | `border-line`, `border-line-strong` | 1px |
| Text | `text-fg`, `text-muted`, `text-subtle` | subtle meets 4.5:1 on canvas |
| Accent | `bg-accent text-accent-fg`, `text-accent-text`, `bg-accent-wash`, `border-accent-line` | |
| Status | `text-ok` / `bg-ok-wash`, `text-bad` / `bg-bad-wash`, `text-info` | small glyphs and badges only |

Type scale: `text-2xs` 12, `xs` 13, `sm` 14, `base` 15, `md` 17, `lg` 20, `xl` 24, `2xl` 30,
`3xl` 40, `4xl` 56, `5xl` 72. Headings use tight tracking (`tracking-[-0.025em]` to `-0.04em` for
display). Body line length under about 75 characters. Use `.tabular` for scores, dates, counts.
Serif: `font-serif` or `.prose-briefing` for dossier content and quotes.

Radii: 4 / 6 / 8 / 12px (`rounded-xs` ... `rounded-lg`). Larger containers use larger radii;
not everything gets the same radius.

## Primitives (`src/components/ui`)

`Button` / `ButtonLink` (primary, secondary, ghost, danger; sm/md/lg), `Field` + `Input` /
`Textarea` / `Select` / `Label`, `Badge` (neutral, accent, ok, bad, outline), `UniquenessMeter`
(five segments; accent only when distinctive), `ProgressBar`, `LiveDot`, `Logo`, `SourceLink`
(host/path + "Verified Nov 5, 2026"), `EmptyState`, `PageHeader`, `Spinner`, `ThemeToggle`, and
icons in `icons.tsx` (1.5px strokes, 16px grid). Add primitives there only if broadly reusable.

## Layout

- App: left sidebar (248px) + content column (max 1120px), generous padding (px-12 at desktop).
- Lists of schools are rows, not a grid of identical cards: one row per school with aligned
  columns (school and unit, prompt, status, uniqueness, lead angle).
- Dossier: a centered document column (about 760px) with a left margin for rank numbers; the
  header block states school, unit, prompt, word limit, date, and the uniqueness score.
- Research view: stage track across the top (it is a real sequence, so numbered steps are
  right here), live log on the left, dossier forming on the right.
- Desktop first; must work at 375px wide (stack columns, no horizontal scroll).

## Motion (`motion/react`)

One orchestrated moment per screen at most. In the app: research events enter with
opacity 0 -> 1 and y 6px -> 0 over 180-260ms (`--ease-out-quint`); ranked details reorder with
layout animation; counters tick. Hover is color and border only (120-150ms). No bounces, no
springs with overshoot, no parallax. Respect `prefers-reduced-motion` (globals.css disables
CSS motion; with `motion`, use `useReducedMotion()` and skip transforms).

## Writing

Sentence case everywhere. No all-caps labels or tracked-out eyebrows above headings. Buttons
say what happens ("Add school", "Export PDF", "Copy share link"), and the result uses the same
words ("Share link copied"). Errors say what happened and what to do, without apologizing.
Empty screens invite the next action. Plain, specific language; no hype ("world-class",
"unlock", "supercharge"), no exclamation marks, no emojis.

Avoid these generic tells: identical rounded cards in a grid, gradient washes, a `→` appended to
links, meta strings joined with middle dots, monospace for labels, numbered markers on content that
is not a sequence, one accented word inside a headline.

## Accessibility

Visible focus (`:focus-visible` ring in accent), labels on every control, `aria-live` for
streaming research updates (polite), 4.5:1 contrast for text, keyboard reachable everything,
`prefers-reduced-motion` respected.
