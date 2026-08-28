# 005 — Pair the model picker's root↔models swap with a real exit

- **Commit:** d618212c84
- **Severity:** HIGH
- **Category:** 7. Cohesion, hierarchy & spatial consistency (root cause is architectural: no exit phase exists at all)
- **Estimated scope:** 1 file, ~50 lines changed/added (`ModelPickerContent.tsx`)

## Problem

The root↔models swap in the model picker's dropdown is enter-only. The two views are siblings
in a `condition ? <A/> : <B/>` — when the condition flips, React unmounts the outgoing view on
the same tick it mounts the incoming one. The incoming view plays its `animate-in
slide-in-from-*-4` keyframe, but the outgoing view gets no exit animation at all: it is simply
gone the instant before the new frame paints. The user sees a hard cut immediately followed by
a slide-in over what was, a frame earlier, different content. This breaks the "one continuous
motion" rule for a swap (AUDIT.md §7 — "Something that slides in from a direction and fades
out — exit direction matches entry" and the object-permanence principle right below it): only
half of the swap is animated, so the motion doesn't read as one thing being replaced by
another, it reads as a flicker followed by a slide.

This is almost certainly the source of the "the transition is weird / not logical" feedback:
without a paired exit, there's no way for the two halves of the navigation (leaving the current
view, arriving at the next one) to feel connected.

## Where

| File | Lines | What's there |
| --- | --- | --- |
| `front/components/model_picker/ModelPickerContent.tsx` | 93–217 | The `DropdownMenuContent` body: a `activeMakerGroup ? <models view> : <root view>` conditional, each branch independently animated in with no exit. |

### Current code

```tsx
// front/components/model_picker/ModelPickerContent.tsx:81
  const activeMakerGroup = makerGroups.find(
    (maker) => maker.makerId === activeMaker
  );

  // The root view's own slide-in would otherwise also play on the very
  // first paint, stacking on top of the dropdown's own open animation. Only
  // animate it on a genuine swap back to root, not on the initial mount.
  const isInitialRenderRef = useRef(true);
  useLayoutEffect(() => {
    isInitialRenderRef.current = false;
  }, []);

  return (
    <DropdownMenuContent
      className="w-84 max-w-(--radix-dropdown-menu-content-available-width)"
      align="start"
      side={side}
      onFocusOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
      onPointerDownOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
      onInteractOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
    >
      {activeMakerGroup ? (
        // Picking a provider swaps the whole dropdown for its model list —
        // a real navigation, not an in-place reveal, so it slides in.
        <div
          key="models"
          className="max-h-[26rem] overflow-y-auto animate-in slide-in-from-right-4 duration-200 motion-reduce:animate-none"
        >
          <ModelPickerModelsView
            makerId={activeMakerGroup.makerId}
            models={activeMakerGroup.models}
            shown={shown}
            agentDefault={agentDefault}
            canRevert={canRevert}
            lockPremiumEfforts={lockPremiumEfforts}
            onBack={onBack}
            onSelectModel={onSelectModel}
            onChangeEffort={onChangeEffort}
            onRevert={onRevert}
          />
        </div>
      ) : (
        <div
          key="root"
          className={`max-h-[26rem] overflow-y-auto animate-in duration-200 motion-reduce:animate-none ${isInitialRenderRef.current ? "" : "slide-in-from-left-4"}`}
        >
          {/* ...tiers, "More models", ModelPickerMakersView... */}
        </div>
      )}
    </DropdownMenuContent>
  );
```

## Target

A small local state machine that keeps the *outgoing* view mounted for exactly as long as its
exit animation takes, so both halves of the swap are visible and animating at once — the old
view sliding out one edge while the new view slides in the opposite edge, in the same direction
convention already established (forward/root→models slides right-to-left; back/models→root
slides left-to-right).

```tsx
type PickerView = "root" | "models";

// ...inside ModelPickerContent, replacing the isInitialRenderRef block:

const activeMakerGroup = makerGroups.find(
  (maker) => maker.makerId === activeMaker
);
const targetView: PickerView = activeMakerGroup ? "models" : "root";

// `displayedView` is what's actually on screen; it only catches up to
// `targetView` once the outgoing view's exit animation has finished. This is
// what lets the swap pair an exit with the entrance instead of hard-cutting.
const [displayedView, setDisplayedView] = useState<PickerView>(targetView);
const isExiting = displayedView !== targetView;

// The root view's own slide-in would otherwise also play on the very first
// paint, stacking on top of the dropdown's own open animation. Only animate
// it on a genuine swap back to root, not on the initial mount.
const isInitialRenderRef = useRef(true);
useLayoutEffect(() => {
  isInitialRenderRef.current = false;
}, []);

const handleExitAnimationEnd = () => {
  setDisplayedView(targetView);
};

// `displayedView` while exiting is the view that's leaving; once the exit
// animation ends we jump straight to `targetView`, which then plays its own
// enter animation on the next render.
const viewToRender = isExiting ? displayedView : targetView;
const isForward = targetView === "models";

const exitClassName = isExiting
  ? `animate-out fill-mode-forwards duration-exit ease-enter motion-reduce:animate-none ${
      viewToRender === "models" ? "slide-out-to-right-4" : "slide-out-to-left-4"
    }`
  : "";

const enterClassName =
  !isExiting && !(viewToRender === "root" && isInitialRenderRef.current)
    ? `animate-in duration-enter ease-enter motion-reduce:animate-none ${
        viewToRender === "models" ? "slide-in-from-right-4" : "slide-in-from-left-4"
      }`
    : "";

return (
  <DropdownMenuContent /* ...unchanged props... */>
    <div
      key={isExiting ? `${viewToRender}-exit` : viewToRender}
      className={`max-h-[26rem] overflow-y-auto ${isExiting ? exitClassName : enterClassName}`}
      onAnimationEnd={isExiting ? handleExitAnimationEnd : undefined}
    >
      {viewToRender === "models" && activeMakerGroup ? (
        <ModelPickerModelsView
          makerId={activeMakerGroup.makerId}
          models={activeMakerGroup.models}
          shown={shown}
          agentDefault={agentDefault}
          canRevert={canRevert}
          lockPremiumEfforts={lockPremiumEfforts}
          onBack={onBack}
          onSelectModel={onSelectModel}
          onChangeEffort={onChangeEffort}
          onRevert={onRevert}
        />
      ) : (
        <>{/* ...tiers, "More models", ModelPickerMakersView, unchanged... */}</>
      )}
    </div>
  </DropdownMenuContent>
);
```

Note: while `isExiting` is true, `viewToRender` is the *old* view (it hasn't caught up to
`targetView` yet), so the maker-model lookup (`activeMakerGroup`) is still resolved against the
current `activeMaker` prop, not a stale one — the `viewToRender === "models" && activeMakerGroup`
guard covers the one edge case where a fast back-then-forward click could momentarily create a
mismatch (falls back safely to rendering nothing extra for that one frame, not a crash).

**Why these values:**
- `duration-exit` (160ms) / `duration-enter` (200ms): the app's own semantic duration tokens
  (`front/../sparkle/src/styles/theme.css:117-118`, `--transition-duration-exit: 160ms`,
  `--transition-duration-enter: 200ms`) — exits are shorter than enters per AUDIT.md §2 ("the
  user has already decided to leave; don't make them wait"), and this repo already encodes that
  exact asymmetry as tokens rather than ad hoc numbers.
- `ease-enter`: the same curve the dropdown's own native open/close animation uses
  (`sparkle/src/components/Dropdown.tsx:48`), so the inner swap reads as part of the same motion
  system as the panel it lives in — see plan 006 for the full rationale.
- `slide-out-to-right-4` / `slide-out-to-left-4` mirror the existing `slide-in-from-*-4`
  distance (16px / `-4` = `1rem`... actually Tailwind's `-4` step is `1rem`; keep it identical to
  the existing enter classes so the two halves travel the same distance) — do not invent a new
  distance.
- `fill-mode-forwards` on the exit: without it, `tailwindcss-animate`'s keyframe would snap back
  to its start position for one frame before `onAnimationEnd` fires and the element unmounts;
  `fill-mode-forwards` holds the final (off-screen) position for that gap.

## Conventions to follow

- `duration-enter` / `duration-exit` / `ease-enter` are real Tailwind utilities generated from
  `@theme` tokens in `sparkle/src/styles/theme.css:106-120` — already used together exactly this
  way in `front/components/workspace/analytics/consumption/ConsumptionAttributionRowsTable.tsx:253-257`
  (a Radix `Collapsible` swapping `data-[state=open]` / `data-[state=closed]` between
  `animate-in`/`animate-out`, `slide-in-from-top-1`/`slide-out-to-top-1`,
  `duration-enter`/`duration-exit`). Match that file's class-name shape, just driven by local
  state instead of Radix's `data-state`.
- Keep the direction convention already established: forward (root → models) travels
  right-to-left (old content exits left, new content enters from the right); back (models →
  root) travels left-to-right. Do not swap this.
- Keep the `isInitialRenderRef` guard exactly as it is today — it must still suppress the root
  view's enter animation on the dropdown's very first paint, just now expressed via the
  `enterClassName` computation instead of inline in the JSX template string.

## Steps

1. In `ModelPickerContent.tsx`, add the `PickerView` type, the `targetView` derivation, and the
   `displayedView` / `isExiting` state as shown in Target.
2. Replace the two `key="models"` / `key="root"` conditional `<div>`s with the single
   `viewToRender`-driven `<div>` shown in Target, wiring `onAnimationEnd` only on the exiting
   phase (it must be `undefined` on the entering phase — an enter animation ending should not
   trigger `handleExitAnimationEnd`).
3. Move the "tiers, More models, ModelPickerMakersView" JSX block (currently inside the
   `key="root"` branch, lines ~139–213) into the `viewToRender === "root"` branch of the new
   single div, unchanged.
4. Double check `shouldBlockDismiss`-related outside-click handlers on `DropdownMenuContent`
   (lines 98–112) are untouched — this plan only touches the inner swap div, not the dropdown's
   own dismiss logic.
5. Run `npx tsgo -p front --noEmit` and `npx biome check --write` on the changed file.

## Out of scope

- Do not touch `ModelPickerMakersView.tsx`, `ModelPickerModelsView.tsx`, or
  `ModelPickerModelRow.tsx` — this plan is scoped to the swap container only.
- Do not add `framer-motion` or any other animation library — this stays plain Tailwind +
  `onAnimationEnd`, consistent with this component's history (framer-motion was deliberately
  removed from this exact component earlier).
- Do not change the "More models" inline expand (no exit animation exists there either, but it's
  a separate finding, not part of this plan).
- Do not change `ModelPicker.tsx` — `activeMaker` / `isMakersExpanded` state ownership stays
  exactly where it is; this plan only adds *derived* local state inside
  `ModelPickerContent.tsx`.

## Verification

**Build**
- [ ] `npx tsgo -p front --noEmit` passes.
- [ ] `npx biome check --write front/components/model_picker/ModelPickerContent.tsx` passes.

**Behavior**
- [ ] Open the model picker, click "More models", click a provider: the tiers/root content
      visibly slides left and out while the provider's model list slides in from the right —
      no blank/cut frame in between.
- [ ] Click the back arrow on the models view: the reverse — models list slides right and out,
      root content slides in from the left.
- [ ] Click a provider, then immediately click back before the forward swap's exit has finished:
      the transition should still resolve to the root view without a stuck/duplicated panel or a
      console error (this exercises the "fast back-then-forward" edge case named in Target).
- [ ] With `prefers-reduced-motion: reduce` emulated in DevTools: no sliding, but the swap should
      still resolve correctly (view content still changes, `motion-reduce:animate-none` on both
      enter and exit classes covers this).
- [ ] The dropdown's very first open still shows the root view appearing with the panel (no
      double slide-in stacking on the panel's own open animation) — this is the existing
      `isInitialRenderRef` behavior, must still hold.

**Feel**
- [ ] Record the forward and back swaps and scrub frame by frame: the two halves (exit + enter)
      should overlap in time, not play sequentially with a gap.
- [ ] Look at it again with fresh eyes before calling it done — specifically judge whether the
      total ~360ms (160ms exit + 200ms enter, run concurrently once entrance starts on
      `handleExitAnimationEnd`) reads as snappy or as a beat too slow; see Notes.

## Notes

- The exit and enter are sequential in this design (enter only starts once
  `handleExitAnimationEnd` fires), not overlapping — so the perceived total is close to
  160ms + 200ms = 360ms, a bit past the ~300ms product-UI budget in AUDIT.md §2. A true
  overlapping crossfade (both views absolutely stacked in a CSS grid cell, animating
  simultaneously) would hit the budget more precisely, but it requires the two views' variable
  heights to coexist in the same box for the transition's duration, which risks a visible height
  jump given the root and models views are meaningfully different heights. I chose the safer
  sequential approach and are flagging the total duration for a human feel-check rather than
  guessing which trade-off is right — if it feels a beat slow, shortening `duration-enter` to
  150ms for this specific swap (keeping `duration-exit` at 160ms) is a reasonable manual
  adjustment, but should be a deliberate call, not silently baked into this plan.
