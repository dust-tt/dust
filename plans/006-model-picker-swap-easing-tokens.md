# 006 — Use the app's own easing/duration tokens on the model picker swap

- **Commit:** d618212c84
- **Severity:** MEDIUM
- **Category:** 2. Easing & duration / 7. Cohesion, hierarchy & spatial consistency
- **Estimated scope:** 1 file, ~4 lines changed (`ModelPickerContent.tsx`)

## Problem

The root↔models swap divs use `animate-in slide-in-from-*-4 duration-200` with no easing class
at all. Tailwind's `animate-in` utility falls back to the browser's default
`animation-timing-function: ease` (`cubic-bezier(0.25, 0.1, 0.25, 1)`) when no `ease-*` class is
present. That's a different curve from the one the dropdown itself uses to open
(`ease-enter` = `cubic-bezier(0.215, 0.61, 0.355, 1)`, set in
`sparkle/src/components/Dropdown.tsx:48`), so the inner swap and the panel's own entrance feel
like two unrelated motion systems stacked on top of each other rather than one component. This
is AUDIT.md §2's "A built-in named curve on a deliberate animation" signal (treat `ease` as a
*category*, not a real cubic-bezier) and §7's cohesion rule (sub-animations of one component
should share a curve so it reads as a single entity).

## Where

| File | Lines | What's there |
| --- | --- | --- |
| `front/components/model_picker/ModelPickerContent.tsx` | 119 | Models-view enter: `animate-in slide-in-from-right-4 duration-200 motion-reduce:animate-none` |
| `front/components/model_picker/ModelPickerContent.tsx` | 137 | Root-view enter: `` `max-h-[26rem] overflow-y-auto animate-in duration-200 motion-reduce:animate-none ${isInitialRenderRef.current ? "" : "slide-in-from-left-4"}` `` |

### Current code

```tsx
// front/components/model_picker/ModelPickerContent.tsx:114
{activeMakerGroup ? (
  <div
    key="models"
    className="max-h-[26rem] overflow-y-auto animate-in slide-in-from-right-4 duration-200 motion-reduce:animate-none"
  >
```

```tsx
// front/components/model_picker/ModelPickerContent.tsx:134
) : (
  <div
    key="root"
    className={`max-h-[26rem] overflow-y-auto animate-in duration-200 motion-reduce:animate-none ${isInitialRenderRef.current ? "" : "slide-in-from-left-4"}`}
  >
```

## Target

Replace the untyped `duration-200` with the semantic `duration-enter` token and add the
`ease-enter` token class, on both divs:

```tsx
// line 119
className="max-h-[26rem] overflow-y-auto animate-in slide-in-from-right-4 duration-enter ease-enter motion-reduce:animate-none"
```

```tsx
// line 137
className={`max-h-[26rem] overflow-y-auto animate-in duration-enter ease-enter motion-reduce:animate-none ${isInitialRenderRef.current ? "" : "slide-in-from-left-4"}`}
```

**Why these values:**
- `duration-enter` resolves to `200ms` via `--transition-duration-enter` in
  `sparkle/src/styles/theme.css:117` — numerically identical to the `duration-200` being
  replaced, so this is a pure semantic substitution, not a timing change.
- `ease-enter` resolves to `cubic-bezier(0.215, 0.61, 0.355, 1)` via `--ease-enter` in
  `sparkle/src/styles/theme.css:106` — the exact curve the dropdown panel itself uses to open
  (`sparkle/src/components/Dropdown.tsx:48`), and the one two other in-app exemplars already use
  for this same "content enters the viewport" situation (see Conventions).

## Conventions to follow

- `duration-enter` / `duration-exit` / `ease-enter` are Tailwind utilities generated from the
  `@theme` block in `sparkle/src/styles/theme.css:106-120` — they are not custom to this file,
  they're already the house convention.
- Exemplars already combining them exactly this way:
  `front/components/workspace/analytics/consumption/ConsumptionAttributionRowsTable.tsx:253-257`
  and `front/components/workspace/analytics/automations/AutomationsTriggersRowsTable.tsx:258-262`
  (both: `ease-enter`, `data-[state=open]:duration-enter`, `data-[state=closed]:duration-exit`).
  `front/components/assistant/conversation/UserAnswerRequired.tsx:292` also uses `ease-enter`
  standalone the same way this plan applies it.
- Do not invent a new easing token or reach for a raw `cubic-bezier(...)` literal — one already
  exists and is the correct semantic match here.

## Steps

1. In `ModelPickerContent.tsx:119`, change `duration-200` to `duration-enter` and add
   `ease-enter` to the class list (see Target for exact string).
2. In `ModelPickerContent.tsx:137`, make the identical substitution inside the template literal.
3. Run `npx tsgo -p front --noEmit` and `npx biome check --write` on the changed file.

## Out of scope

- Do not touch the dropdown's own native open/close animation
  (`sparkle/src/components/Dropdown.tsx`) — it already uses these tokens correctly and is a
  shared design-system file, not scoped to this component.
- Do not touch any other duration/easing in this component family (the "More models" expand has
  no animation at all today — a separate, not-yet-selected finding, not this plan's concern).
- If plan 005 (pairing the swap with a real exit) is executed, its `enterClassName` /
  `exitClassName` computation already includes `duration-enter ease-enter` /
  `duration-exit ease-enter` — in that case this plan is already satisfied as a byproduct and
  this diff becomes a no-op. Apply whichever plan lands first; do not apply both independently if
  they'd conflict on the same lines — check `ModelPickerContent.tsx`'s current state before
  starting.

## Verification

**Build**
- [ ] `npx tsgo -p front --noEmit` passes.
- [ ] `npx biome check --write front/components/model_picker/ModelPickerContent.tsx` passes.

**Behavior**
- [ ] Open the model picker, trigger the root↔models swap: the inner swap and the panel's own
      open animation now visibly share the same "snap in, ease out" quality — no perceptible
      seam between the two.
- [ ] With `prefers-reduced-motion: reduce` emulated in DevTools: nothing slides
      (`motion-reduce:animate-none` is untouched by this plan).

**Feel**
- [ ] Since the duration is numerically unchanged (`duration-200` → `duration-enter` is a
      200ms → 200ms rename), the only perceptible change is the curve shape — confirm the swap
      no longer has the slightly "flatter"/generic feel of the browser default `ease`.

## Notes

- This is a pure token substitution with no behavior change beyond the curve shape — low risk,
  no judgment call needed from a human reviewer beyond the one-line feel-check above.
