import { useModelPickerHighlight } from "@app/hooks/useModelPickerHighlight";
import { useClientType } from "@app/lib/context/clientType";
import { cn } from "@dust-tt/sparkle";
import type React from "react";
import { useEffect, useRef } from "react";

interface GlintStreaksProps {
  className: string;
}

/**
 * The two diagonal light streaks, as one sweepable layer. The leading streak
 * reads brighter than the one trailing it, the way a highlight travelling over a
 * surface does. Both overshoot the box vertically so the 30° rotation still
 * covers its full height.
 */
function GlintStreaks({ className }: GlintStreaksProps) {
  return (
    <span className={cn("absolute inset-0", className)}>
      <span className="absolute -top-1/4 left-0 h-[150%] w-[3px] rotate-[30deg] bg-blue-50 blur-[1px]" />
      <span className="absolute -top-1/3 left-[5px] h-[165%] w-[3px] rotate-[30deg] bg-blue-50/70 blur-[1px]" />
    </span>
  );
}

interface ModelPickerHighlightProps {
  children: React.ReactNode;
}

/**
 * Temporary treatment drawing attention to the model picker: a blue ring that
 * pulses twice every 7s, a light sweep chained right after each pulse, and one
 * extra sweep on hover. Clicking the picker retires it for the rest of the visit;
 * `useModelPickerHighlight` caps how many page loads ever show it.
 *
 * Web only. The extension has its own localStorage, so highlighting there would
 * spend a second pair of views on the same person, and its input bar is too
 * cramped to take an extra ring.
 *
 * Every overlay is absolutely positioned and `pointer-events-none`, so the
 * button's own box, layout and hit area are untouched whether the highlight is on
 * or off. Remove this wrapper and nothing shifts.
 */
export function ModelPickerHighlight({ children }: ModelPickerHighlightProps) {
  const clientType = useClientType();
  const { isHighlightVisible, dismissHighlight } = useModelPickerHighlight({
    disabled: clientType === "extension",
  });
  const hostRef = useRef<HTMLSpanElement>(null);

  // Listened for on the host rather than declared as a prop: the span only
  // observes the button's presses, it is not itself interactive.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isHighlightVisible) {
      return;
    }
    // `pointerdown`, not `click`: Radix opens the menu on pointerdown and, being
    // modal, sets `pointer-events: none` on the body. The mouseup that follows
    // then hit-tests to <html> rather than the button, so no click event ever
    // reaches this subtree. Restricted to the primary button to match Radix's
    // own condition for opening.
    const dismissOnPrimaryButton = (event: PointerEvent) => {
      if (event.button === 0) {
        dismissHighlight();
      }
    };
    host.addEventListener("pointerdown", dismissOnPrimaryButton);
    return () =>
      host.removeEventListener("pointerdown", dismissOnPrimaryButton);
  }, [isHighlightVisible, dismissHighlight]);

  return (
    // The host stays mounted after dismissal, so clicking cannot remount the
    // picker and close the dropdown it just opened.
    <span ref={hostRef} className="glint-host relative inline-flex">
      {children}
      {isHighlightVisible && (
        <>
          <span
            aria-hidden
            className="glint-ring-pulse pointer-events-none absolute inset-0 rounded-lg border border-blue-200"
          />
          {/* The swept layers span the button, so the keyframes' percentage
              translations scale with it and the streaks cross the whole box. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
          >
            <GlintStreaks className="glint-sweep" />
            <GlintStreaks className="glint-sweep-hover" />
          </span>
        </>
      )}
    </span>
  );
}
