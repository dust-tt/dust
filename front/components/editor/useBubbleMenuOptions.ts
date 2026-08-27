import { useMemo, useState } from "react";

export const BUBBLE_MENU_APPEND_TO = () => document.body;

// Inline because the menu element is created by the tiptap plugin outside
// React's tree, so the inline style is the channel guaranteed to reach it.
// Above the z-50 overlay band: overlays are body portals appended after this
// element, so an equal z-index loses the tie by DOM order and the toolbar
// paints behind them. The menu auto-hides on editor blur before any dialog
// or popover needs the front.
export const BUBBLE_MENU_STYLE = { zIndex: 60 };

// Pop-in for the toolbar pill, driven by the same `isPositioned` flag that
// gates its visibility: a transition (not a keyframe) so a selection changing
// mid-animation retargets instead of restarting. Scales from the bottom
// because the pill sits above the selection, so it grows out of the text it
// acts on. 150ms ease-out keeps it in the popover band and reads as an
// instant response to the selection.
export const BUBBLE_MENU_TOOLBAR_MOTION_CLASSES =
  "origin-bottom transition-[opacity,transform] duration-100 ease-out-quart motion-reduce:transition-none";
export const BUBBLE_MENU_TOOLBAR_HIDDEN_CLASSES = "scale-[0.98] opacity-0";

/**
 * Options for Tiptap's BubbleMenu plus an `isPositioned` flag to gate the
 * menu's visibility. The plugin's `show()` unhides the element immediately
 * but only applies coordinates in an async `computePosition().then()`, so on
 * first show the menu paints un-positioned for a few frames; hide it (e.g.
 * with `opacity-0`) until `isPositioned` turns true.
 *
 * Use together with `appendTo={BUBBLE_MENU_APPEND_TO}` and the default
 * `absolute` strategy: coordinates are then resolved against document.body,
 * which is never clipped by overflow ancestors and never becomes a containing
 * block the way `strategy: "fixed"` ancestors with filters/transforms do.
 *
 * Both exports are referentially stable: the plugin re-runs its update effect
 * whenever `appendTo` or `options` changes identity, so inline literals would
 * cause an infinite render loop.
 */
export function useBubbleMenuOptions() {
  const [isPositioned, setIsPositioned] = useState(false);
  const options = useMemo(
    () => ({
      placement: "top" as const,
      offset: 8,
      onShow: () => setIsPositioned(false),
      onUpdate: () => setIsPositioned(true),
      onHide: () => setIsPositioned(false),
    }),
    []
  );
  return { options, isPositioned };
}
