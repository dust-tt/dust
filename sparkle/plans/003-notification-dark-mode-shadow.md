# 003 — Fix Notification card shadow in dark mode

- **Status**: TODO
- **Commit**: 83fe4b473c
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, 1 line

## Problem

`sparkle/src/components/Notification.tsx:57`

Current shadow applied unconditionally to both light and dark modes:

```
shadow-[0px_0.5px_1px_0px_rgba(0,0,0,0.04),0px_1px_1px_0px_rgba(0,0,0,0.06),inset_2px_-2px_7px_0px_rgba(0,0,0,0.01),inset_0px_4px_4px_0px_rgba(255,255,255,0.08)]
```

In dark mode:
- `bg-background` = `oklch(18.5% 0.004 49.25)` (nearly black)
- Drop shadows `rgba(0,0,0,0.04)` and `rgba(0,0,0,0.06)` are invisible on a near-black surface
- `inset_0px_4px_4px_0px_rgba(255,255,255,0.08)` is the only depth cue — at 8% opacity it is imperceptible
- The border `border-border` = `var(--color-stone-800)` blends with the background

Result: cards look completely flat and borderless in dark mode, losing all spatial structure.

## Target

Keep the existing light-mode shadow unchanged. Override in dark mode with a shadow that creates visible depth on a dark surface — a top-edge inner highlight (common glass-dark convention) plus a stronger drop shadow:

```tsx
// light shadow (unchanged)
"shadow-[0px_0.5px_1px_0px_rgba(0,0,0,0.04),0px_1px_1px_0px_rgba(0,0,0,0.06),inset_2px_-2px_7px_0px_rgba(0,0,0,0.01),inset_0px_4px_4px_0px_rgba(255,255,255,0.08)]",
// dark shadow override
"dark:shadow-[0px_2px_8px_0px_rgba(0,0,0,0.45),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)]",
// border: use slightly lighter stone-700 in dark mode for visibility
"dark:border-border-dark"
```

Dark shadow values:
- `0px_2px_8px_0px_rgba(0,0,0,0.45)` — visible drop shadow even on a near-black bg
- `inset_0px_1px_0px_0px_rgba(255,255,255,0.1)` — 1px top-edge inner highlight; the standard glass-dark depth cue
- `dark:border-border-dark` — maps to `var(--color-stone-700)` in dark mode (tokens.css:440), one step lighter than `stone-800`, making the card boundary visible

## Repo conventions to follow

- `border-border-dark` is already a semantic token (`tokens.css:284 / 440`) — use it, don't hardcode a color.
- `dark:` class-based dark mode variant is how the codebase does it (`theme.css:25`: `@custom-variant dark (&:where(.dark, .dark *))`).

## Steps

1. **`sparkle/src/components/Notification.tsx` — `NotificationContent` return (line ~54-57)**

   In the outermost `<div>` className, replace the single shadow string:
   ```
   // before
   "shadow-[0px_0.5px_1px_0px_rgba(0,0,0,0.04),0px_1px_1px_0px_rgba(0,0,0,0.06),inset_2px_-2px_7px_0px_rgba(0,0,0,0.01),inset_0px_4px_4px_0px_rgba(255,255,255,0.08)]"
   ```
   With:
   ```
   // after
   "shadow-[0px_0.5px_1px_0px_rgba(0,0,0,0.04),0px_1px_1px_0px_rgba(0,0,0,0.06),inset_2px_-2px_7px_0px_rgba(0,0,0,0.01),inset_0px_4px_4px_0px_rgba(255,255,255,0.08)]",
   "dark:shadow-[0px_2px_8px_0px_rgba(0,0,0,0.45),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)]",
   "dark:border-border-dark"
   ```

## Boundaries

- Do NOT touch any other className, prop, or file.
- Do NOT touch the light-mode shadow string.
- Do NOT add new dependencies.

## Verification

- **Mechanical**: `cd sparkle && npx tsc --noEmit` — no new errors expected beyond pre-existing.
- **Feel check**:
  1. Open Storybook `Feedback & Status/Notification` → `Inline`.
  2. Toggle dark mode via the Storybook toolbar.
  3. Cards should have a visible 1px top-edge highlight and a subtle outer shadow — clearly elevated from the dark background.
  4. Border should be perceptible (not blend into the background).
  5. Toggle back to light mode — cards should look identical to before.
- **Done when**: toast cards read as clearly elevated surfaces in both light and dark mode.
