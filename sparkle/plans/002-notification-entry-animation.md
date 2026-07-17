# 002 — Add entry animation to Notification toast

- **Status**: TODO
- **Commit**: 83fe4b473c
- **Severity**: HIGH
- **Category**: Physicality & missed opportunity
- **Estimated scope**: 1 file, 1 line

## Problem

`sparkle/src/components/Notification.tsx:52-57`

The `Toaster` is configured with `unstyled: true`, which strips Sonner's built-in CSS entirely — including its slide-in animation. The `NotificationContent` card div has no entry animation classes:

```tsx
// current — no animation
<div
  className={cn(
    "pointer-events-auto relative flex w-[246px] flex-col overflow-clip",
    "rounded-xl border border-border bg-background p-2",
    "shadow-[...]"
  )}
>
```

Toasts pop in with zero transition — jarring for an occasional, high-signal UI element.

## Target

Add scale + fade entry using `tw-animate-css` utilities, with `origin-bottom-right` so the zoom scales from the corner where toasts appear:

```tsx
// target
<div
  className={cn(
    "pointer-events-auto relative flex w-[246px] flex-col overflow-clip",
    "rounded-xl border border-border bg-background p-2",
    "shadow-[...]",
    "animate-in fade-in-0 zoom-in-95 duration-200 ease-emphasized",
    "origin-bottom-right motion-reduce:animate-none"
  )}
>
```

Exact values:
- `animate-in fade-in-0 zoom-in-95` — scale from 0.95 + opacity 0 (never from scale(0))
- `duration-200` — within the 125–200ms toast budget from AUDIT.md
- `ease-emphasized` — resolves to `cubic-bezier(0.23, 1, 0.32, 1)` (strong ease-out, already in `theme.css:106`)
- `origin-bottom-right` — toasts stack at bottom-right; zoom should emerge from that corner
- `motion-reduce:animate-none` — drops movement for `prefers-reduced-motion`, but card still appears (opacity change handled by the browser)

## Repo conventions to follow

- `tw-animate-css` utilities (`animate-in`, `fade-in-0`, `zoom-in-95`, `ease-emphasized`, `motion-reduce:animate-none`) are used identically in `sparkle/src/components/Tooltip.tsx:42-43` and `sparkle/src/components/Dialog.tsx:22`.
- `ease-emphasized` = `cubic-bezier(0.23, 1, 0.32, 1)` is already a token in `sparkle/src/styles/theme.css:106`.

## Steps

1. **`sparkle/src/components/Notification.tsx` — `NotificationContent` return (line ~52)**

   In the outermost `<div>` className, add after the shadow string:
   ```
   "animate-in fade-in-0 zoom-in-95 duration-200 ease-emphasized",
   "origin-bottom-right motion-reduce:animate-none"
   ```

## Boundaries

- Do NOT touch any other className, prop, or file.
- Do NOT add new dependencies.
- Do NOT add exit animation — Sonner handles swipe-to-dismiss natively.

## Verification

- **Mechanical**: `cd sparkle && npx tsc --noEmit` — pre-existing error in `createBaseMarkdownComponents.ts` is unrelated; no new errors expected.
- **Feel check**:
  1. Open Storybook `Feedback & Status/Notification` → `Example`.
  2. Click "Show Success" — toast should scale in crisply from bottom-right (not pop in instantly).
  3. In DevTools Animations panel, set playback to 10% — confirm scale goes from ~0.95→1 and opacity 0→1 simultaneously, decelerating sharply (ease-out-quint shape).
  4. Toggle `prefers-reduced-motion` (DevTools Rendering panel) — toast should still appear but with no scale movement.
- **Done when**: toasts no longer pop in instantaneously; entry feels snappy but not distracting.
