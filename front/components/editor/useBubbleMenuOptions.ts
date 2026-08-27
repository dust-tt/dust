import { useMemo, useState } from "react";

export const BUBBLE_MENU_APPEND_TO = () => document.body;

// Inline complement to the z-50 class: the menu element is created by the
// tiptap plugin outside React's tree, so the inline style is the channel
// guaranteed to reach it regardless of how the class syncs. Same value as
// z-50 so overlays that follow it in the DOM (dialogs, popovers) still win.
export const BUBBLE_MENU_STYLE = { zIndex: 50 };

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
