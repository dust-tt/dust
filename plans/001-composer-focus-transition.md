# 001 — Animate the Composer default → focus state change

- **Status**: DONE
- **Commit**: 9aa5607b8a
- **Severity**: MEDIUM
- **Category**: Easing & duration / Missed opportunities
- **Estimated scope**: 2 files, ~6 lines

## Problem

The Composer card's default → focus transition (background-color + box-shadow)
snaps instantly — no `transition` at all is applied to the classes that change
on focus. This is a state-indication change (category: hover/color change per
AUDIT.md §2), and per AUDIT.md §8 (missed opportunities) an instant teleport
between two close-but-different visual states (`#fbfbfb` → `#fff`, and a
softened shadow) reads as a flicker rather than a deliberate focus cue.

Current code:

```tsx
// sparkle/src/components/Composer.tsx:36-49 — current
<div
  className={cn(
    "relative flex w-full flex-col items-stretch rounded-[40px] [corner-shape:squircle]",
    variant === "floating" && [
      "border border-white/90",
      // Focus (Figma 11174:21613): white surface, softened drop shadows.
      isFocused
        ? "bg-white shadow-[0px_-0.5px_1px_1px_rgba(0,0,0,0.02),0px_8px_10px_-6px_rgba(0,0,0,0.07),0px_20px_25px_-5px_rgba(0,0,0,0.07),0px_0px_1px_0px_rgba(0,0,0,0.07)]"
        : "bg-[#fbfbfb] shadow-[0px_-0.5px_1px_1px_rgba(0,0,0,0.02),0px_8px_10px_-6px_rgba(0,0,0,0.1),0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_0px_1px_0px_rgba(0,0,0,0.07)]",
      "dark:border-transparent dark:bg-[#2e2c28]",
      "dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.02),inset_0px_0px_0px_1px_rgba(255,255,255,0.04),0px_0px_0px_1px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]",
    ],
    ...
```

```tsx
// front/components/assistant/conversation/input_bar/InputBar.tsx:486-503 — current
: classNames(
    "w-full rounded-[40px] [corner-shape:squircle]",
    "border border-white/90",
    "bg-[#fbfbfb] shadow-[0px_-0.5px_1px_1px_rgba(0,0,0,0.02),0px_8px_10px_-6px_rgba(0,0,0,0.1),0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_0px_1px_0px_rgba(0,0,0,0.07)]",
    "has-[.tiptap:focus]:bg-white",
    "has-[.tiptap:focus]:shadow-[0px_-0.5px_1px_1px_rgba(0,0,0,0.02),0px_8px_10px_-6px_rgba(0,0,0,0.07),0px_20px_25px_-5px_rgba(0,0,0,0.07),0px_0px_1px_0px_rgba(0,0,0,0.07)]",
    "dark:border-transparent dark:bg-[#2e2c28]",
    "dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.02),inset_0px_0px_0px_1px_rgba(255,255,255,0.04),0px_0px_0px_1px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]",
    "dark:has-[.tiptap:focus]:bg-[#2e2c28]",
    "dark:has-[.tiptap:focus]:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.02),inset_0px_0px_0px_1px_rgba(255,255,255,0.04),0px_0px_0px_1px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]"
  )
```

Neither element has a `transition` utility on the properties that change
(`background-color`, `box-shadow`), so the swap is instant in both React
(`isFocused` re-render) and CSS (`:focus-within`/`has()`) cases.

## Target

Add a `transition` covering exactly `background-color` and `box-shadow`, at
**200ms** with the repo's existing strong ease-out token
`var(--ease-emphasized)` (`cubic-bezier(0.23, 1, 0.32, 1)`, defined in
`sparkle/src/styles/theme.css:106`). This is a state/color-change animation
(AUDIT.md §2: "Hover / color change → `ease`"), but this repo's own
convention for exactly this kind of transition (Button.tsx) already reaches
for a strong `ease-out` curve rather than the flat CSS `ease` keyword, so we
follow the repo, not the generic default. 200ms sits inside the AUDIT.md UI
budget (<300ms) and matches the "tooltips/small popovers" bracket (125–200ms)
— appropriate for a state cue this size and this frequent (every time a user
clicks into the composer, so it must stay snappy).

```tsx
/* target */
"relative flex w-full flex-col items-stretch rounded-[40px] [corner-shape:squircle]",
"transition-[background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
```

```tsx
/* target */
"w-full rounded-[40px] [corner-shape:squircle]",
"transition-[background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
```

Only `background-color` and `box-shadow` are listed — never `transition-all`
(AUDIT.md §5: `transition: all` animates unintended properties off the GPU
path; this element also animates `border-color` via Tailwind's `dark:`
variant switch, which is intentionally excluded here since border color
switches happen instantly alongside the theme, not the focus state).

No `prefers-reduced-motion` handling is required (AUDIT.md §6): this is a
compositor-cheap color/shadow crossfade with no movement, which is exactly
the category `prefers-reduced-motion` guidance says to *keep* ("keep
transitions that aid comprehension, remove position changes").

## Repo conventions to follow

- Easing tokens live in `sparkle/src/styles/theme.css` — `--ease-emphasized:
  cubic-bezier(0.23, 1, 0.32, 1);` (`theme.css:106`) is the exact strong
  ease-out curve AUDIT.md recommends; reuse it via Tailwind's arbitrary-value
  syntax `ease-[cubic-bezier(0.23,1,0.32,1)]` since there is no existing
  `ease-emphasized` Tailwind utility wired up (grep confirms no
  `ease-emphasized` class usage anywhere in `sparkle/src` or `front/`).
- Exemplar: `sparkle/src/components/Button.tsx:52` —
  `"transition-[color,background-color,border-color,transform] duration-100
  ease-out"` — the existing pattern in this exact codebase for animating a
  *specific* property list (never `transition-all`) on a color/state change.
  This plan's `duration-200` is intentionally a notch slower than the
  button's `duration-100` because the animated area is much larger (the
  whole composer card vs. a small button) and covers a shadow blur radius
  change, which reads better slightly slower.

## Steps

1. In `sparkle/src/components/Composer.tsx`, in the `variant === "floating"`
   branch's `isFocused` ternary lines (currently lines 41-49), add
   `"transition-[background-color,box-shadow] duration-200
   ease-[cubic-bezier(0.23,1,0.32,1)]"` as a new array entry immediately
   after the `"border border-white/90"` line, so it applies regardless of
   which side of the ternary is active. Do not add it to the `"flat"`
   variant branch (its focus change is a `border-color` swap, not
   background/shadow — out of scope for this plan).
2. In `front/components/assistant/conversation/input_bar/InputBar.tsx`, in
   the non-compact branch's `classNames(...)` call (currently lines 487-503),
   add the same `"transition-[background-color,box-shadow] duration-200
   ease-[cubic-bezier(0.23,1,0.32,1)]"` string as a new array entry
   immediately after the `"w-full rounded-[40px]
   [corner-shape:squircle]"` line.

## Boundaries

- Do NOT touch the `variant === "flat"` branch in Composer.tsx.
- Do NOT touch the `effectiveIsCompact` (pill) branch in InputBar.tsx.
- Do NOT change the radius, squircle, colors, or shadow values themselves —
  transition timing only.
- Do NOT use `transition-all` or `transition-colors` (the latter would also
  catch `border-color`, which is intentionally excluded).
- If the cited line numbers have drifted from the code you find (e.g. the
  squircle radius value differs from `40px`), locate the block by the
  `isFocused` ternary / `has-[.tiptap:focus]` selectors instead of by line
  number, and proceed — the transition addition is independent of the exact
  radius/color values.

## Verification

- **Mechanical**: `cd sparkle && npx biome check src/components/Composer.tsx`
  and `cd front && npx biome check
  components/assistant/conversation/input_bar/InputBar.tsx` — both must pass
  with no new warnings. No build step required (pure className string
  change).
- **Feel check**: in Storybook (`Composer/Composer` → `Floating`), click into
  the textarea and click out again several times:
  - The background and shadow should visibly crossfade over ~200ms, not
    snap.
  - The transition must feel identical in both directions (focus → default
    plays the same duration/curve as default → focus — this is one shared
    `transition` declaration, not two separate one-way animations, so this
    should hold automatically).
  - Rapidly click in and out (interrupt mid-transition): the crossfade must
    retarget smoothly from wherever it currently is, never jump or restart
    from the original state (CSS `transition` on a class toggle does this
    for free — confirm it actually does, since a stray `key` remount or
    conditional unmount elsewhere could defeat it).
  - In Chrome DevTools → More tools → Animations, trigger the focus change
    and set playback to 10% to confirm the curve accelerates out of the
    change smoothly (strong ease-out: fast start, gentle settle) rather than
    linear or slow-starting.
- **Done when**: both files compile/lint clean, and the focus/blur
  crossfade in Storybook and in the real `front` input bar (local dev or the
  PR preview) is visibly smooth rather than an instant snap, in both light
  and dark mode.
