# 001 — Speed up tooltip animation

- **Status**: DONE
- **Commit**: e6a7f237bf
- **Severity**: HIGH
- **Category**: Easing & duration, Physicality, Purpose & frequency
- **Estimated scope**: 1 file, ~5 lines

## Problem

`sparkle/src/components/Tooltip.tsx:47`

```tsx
// current
"animate-in fade-in-0 zoom-in-95 duration-200 ease-enter",
"data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150",
"data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
```

Three compounding issues:

1. **Enter is 200ms** — top of the 125-200ms budget. 150ms is more responsive.
2. **`ease-enter`** = `cubic-bezier(0.215, 0.61, 0.355, 1)` (ease-out-cubic). Too soft; the
   curve reaches its destination slowly right when the eye is watching. `ease-emphasized`
   (`cubic-bezier(0.23, 1, 0.32, 1)`, already in `theme.css:106`) is ease-out-quint and
   snaps to the target far faster at the same duration.
3. **`slide-in-from-*-1`** adds 4px of directional travel on top of the `zoom-in-95` scale.
   The combined motion (scale + translate) reads as longer than either alone. Pure scale +
   fade is sufficient and feels crisper.

`sparkle/src/components/Tooltip.tsx:91` — `TooltipProvider` has no `skipDelayDuration`.
After the first tooltip opens, hovering adjacent triggers resets the full 300ms delay and
re-runs the entry animation, making a tooltip toolbar feel sluggish.

## Target

```tsx
// enter: 150ms ease-out-quint, no slide
"animate-in fade-in-0 zoom-in-95 duration-150 ease-emphasized",
// exit: snap at 100ms
"data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100",
// slide lines: DELETED
```

```tsx
// TooltipProvider in Tooltip wrapper
<TooltipProvider delayDuration={delayDuration} skipDelayDuration={0}>
```

## Repo conventions to follow

- Easing tokens live in `sparkle/src/styles/theme.css` as CSS variables; Tailwind utilities
  pick them up automatically (e.g. `ease-emphasized`, `ease-enter`).
- Exemplar using `ease-emphasized`: `sparkle/src/components/Dialog.tsx:22`.

## Steps

1. **`sparkle/src/components/Tooltip.tsx` — TooltipContent classes (line ~42)**

   Replace:
   ```
   "animate-in fade-in-0 zoom-in-95 duration-200 ease-enter",
   "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 data-[side=bottom]:slide-in-from-top-2 ...",
   "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
   ```
   With:
   ```
   "animate-in fade-in-0 zoom-in-95 duration-150 ease-emphasized",
   "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100",
   ```

2. **`sparkle/src/components/Tooltip.tsx` — TooltipProvider in Tooltip wrapper (line ~91)**

   Replace:
   ```tsx
   <TooltipProvider delayDuration={delayDuration}>
   ```
   With:
   ```tsx
   <TooltipProvider delayDuration={delayDuration} skipDelayDuration={0}>
   ```

## Boundaries

- Do NOT touch markup/structure, props, or any other component.
- Do NOT add new easing tokens — use `ease-emphasized` which already exists.

## Verification

- **Mechanical**: `cd sparkle && npx tsc --noEmit` — no new errors expected.
- **Feel check**:
  - Open Storybook `Overlays/Tooltip/Tooltip Example`, hover "Hover" — tooltip should snap
    in crisply and disappear almost instantly.
  - Open `Tooltip With Shortcut`, hover rapidly between the two text triggers — the second
    should open with no delay and no animation (skipDelayDuration).
  - In DevTools Animations panel, set playback to 10% and confirm: scale from `0.95→1`
    only (no translate), decelerating sharply in the first third of the 150ms.
  - Toggle `prefers-reduced-motion` — animation classes are gated via `motion-reduce:animate-none`; confirm tooltip still appears (opacity change only).
- **Done when**: entry feels snappy rather than sluggish; exit disappears almost instantly;
  toolbar hovering feels continuous with no per-tooltip delay.
