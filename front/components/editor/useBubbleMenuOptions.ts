import { useMemo, useState } from "react";

/**
 * Options for Tiptap's BubbleMenu plus an `isPositioned` flag to gate the
 * menu's visibility. The plugin's `show()` unhides the element immediately
 * but only applies coordinates in an async `computePosition().then()`, so on
 * first show the menu paints un-positioned for a few frames; hide it (e.g.
 * with `opacity-0`) until `isPositioned` turns true.
 *
 * The returned `options` object is referentially stable: the plugin re-runs
 * its update effect whenever `options` changes identity, so an inline literal
 * would cause an infinite render loop.
 */
export function useBubbleMenuOptions() {
  const [isPositioned, setIsPositioned] = useState(false);
  const options = useMemo(
    () => ({
      strategy: "fixed" as const,
      onShow: () => setIsPositioned(false),
      onUpdate: () => setIsPositioned(true),
      onHide: () => setIsPositioned(false),
    }),
    []
  );
  return { options, isPositioned };
}
