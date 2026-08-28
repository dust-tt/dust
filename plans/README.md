# Animation improvement plans

Generated from a full-codebase `/improve-animations` audit (recon covered every `framer-motion`/`motion` consumer in `front/components/`, both global CSS keyframe files, the command palette, the model picker, and Sparkle's `Dialog`/`Dropdown` primitives). Stamped at commit `b96c2e874d`.

The audit surfaced one recon fact that reframes several findings: `@dust-tt/sparkle` ships a JS-consumable motion token system (`MOTION_EASINGS`/`MOTION_DURATIONS` in `sparkle/src/lib/motion.ts`) specifically for dropdown/popover/modal timing, correctly adopted in only 4 of ~20 motion-consuming files. Several plans below exist because of that gap.

**Plans 001–004 are stale.** The full-codebase execution that originally produced them was
reverted at the user's request (scope creep — they'd only asked for the model picker's drill-down
transition). They're left here for reference/reconciliation but nothing in this directory
currently reflects executed work; treat them as unconfirmed until `/improve-animations reconcile`
or a fresh execution revisits them.

**Plans 005–006** are a separate, narrower audit scoped specifically to the model picker's
drill-down swap (`ModelPickerContent.tsx`), stamped at commit `d618212c84`, after the drill-down
feature itself was rebuilt from scratch on `modelPickerImprovement`.

## Status

| Plan | Severity | Category | Status | Depends on |
| --- | --- | --- | --- | --- |
| [001 — Command palette instant keyboard highlight](001-command-palette-instant-keyboard-highlight.md) | HIGH | 1. Frequency | Stale (reverted) | — |
| [002 — Model picker adopt motion tokens](002-model-picker-adopt-motion-tokens.md) | HIGH | 7. Cohesion | Stale (reverted, superseded by 005/006) | — |
| [003 — Analytics consolidate chart transition tokens](003-analytics-consolidate-chart-transition-tokens.md) | HIGH | 7. Cohesion | Stale (reverted) | — |
| [004 — CSS keyframes reduced-motion](004-css-keyframes-reduced-motion.md) | HIGH | 6. Accessibility | Stale (reverted) | — |
| [005 — Model picker paired swap exit](005-model-picker-paired-swap-exit.md) | HIGH | 7. Cohesion | Done | — |
| [006 — Model picker swap easing tokens](006-model-picker-swap-easing-tokens.md) | MEDIUM | 2. Easing & duration | Done (subsumed by 005's rewrite — the `duration-enter`/`ease-enter` classes landed as part of it) | 005 |

**Execution note on 005:** the implementation matches the plan's Target with two corrections found
during execution that the plan's draft didn't fully account for: (1) `activeMakerGroup` resolves
to `undefined` the instant `activeMaker` is cleared on a back-navigation, before the exit
animation finishes — a `lastMakerGroupRef` now remembers the last non-null maker group so the
exiting models view still has data to render while it slides out; (2)
`motion-reduce:animate-none` removes the CSS animation entirely under
`prefers-reduced-motion: reduce`, which meant `onAnimationEnd` would never fire and the swap
would get permanently stuck mid-exit — a `useEffect` now detects that preference and skips
straight to the target view instead of waiting for an animation that will never complete.

## Recommended execution order

**005 → 006.** Both touch the same lines in `ModelPickerContent.tsx`. Execute 005 first — its
rewrite already includes the `duration-enter`/`duration-exit`/`ease-enter` token classes 006
asks for, so once 005 lands, 006 is a no-op (confirm and close it rather than reapplying). If for
some reason only the easing fix is wanted without the exit-pairing rework, 006 can be applied
alone against the current code — it's a much smaller, lower-risk change.

Plans 001–004 (stale, see note above) were originally independent of each other and of the
model-picker work; if ever revisited, re-run `/improve-animations reconcile` first since the
code they reference has moved on since they were written.

## Findings not turned into plans this round

From the full audit table, these survived vetting but weren't selected:

- **MEDIUM** — `InAppBanner.tsx:55-57`, `ease: "easeIn"` on the banner's dismiss exit + likely `opacity: 100` typo. Small, single-file, low risk — worth a quick fix whenever someone's next in that file.
- **MEDIUM** — `SidebarMenu.tsx` six inline `{ ease: "easeOut", duration: 0.1 }` objects — same category as plan 002/003 but a different component; could be folded into a future "sweep the rest of the app" pass once 002/003 establish the pattern is working well.
- **MEDIUM** — `ModelPickerModelRow.tsx` effort-slider reveal uses identical enter/exit duration (should be asymmetric, exit shorter) — small enough to fold into plan 002's execution if the executor notices it, but not written up separately.
- **LOW / exempt-leaning** — `SidebarMenu.tsx` `gridTemplateRows` animation — vetted down from the sub-agent's original HIGH; this is arguably the sanctioned `0fr`↔`1fr` grid-trick idiom applied to few-children rows, not a clear regression. Flagged for awareness only.
- **LOW** — `theme-extras.css:42-51` `@keyframes appear` (animates `width` from 0, no visible starting shape) — likely dead/orphaned CSS; confirm with a grep for consumers before spending a plan on it.
- **Duplicate dead CSS** — `global.css:152-173` has a shadowed, unused second copy of `@keyframes shake` (theme-extras.css's copy wins). Cheap one-line deletion, not worth its own plan; fold into plan 004's diff if the executor notices it while investigating that file, otherwise leave for a future pass.

## Re-running this audit later

Use `/improve-animations reconcile` to re-check this directory against current code once these plans have been executed — it will mark finished plans DONE, refresh any `file:line` references that drifted, and retire findings that no longer apply.
