import { useCallback, useRef, useState } from "react";

const LOCAL_STORAGE_KEY = "modelPickerHighlightDismissals";

// Temporary discovery treatment: two presses of the picker are taken as proof the
// control has been understood, after which the highlight never comes back.
const MAX_DISMISSALS = 2;

// The campaign runs for two weeks. Encoded as a date rather than left to a
// manual revert so it dies on its own even if the code outlives the campaign —
// otherwise someone signing up in three months would still be nudged, and so
// would anyone who never presses the picker.
const CAMPAIGN_END = Date.parse("2026-08-26T23:59:59Z");

function readDismissals(): number {
  if (typeof window === "undefined") {
    return MAX_DISMISSALS;
  }
  try {
    const parsed = Number.parseInt(
      localStorage.getItem(LOCAL_STORAGE_KEY) ?? "",
      10
    );
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    // localStorage unavailable: with no way to remember the count, staying quiet
    // beats highlighting on every single page load forever.
    return MAX_DISMISSALS;
  }
}

interface UseModelPickerHighlightOptions {
  // Surfaces that opt out keep the stored count untouched, so disabling one does
  // not silently spend the allowance meant for another.
  disabled: boolean;
}

/**
 * Visibility of the model picker's discovery highlight.
 *
 * The allowance is spent by *pressing* the picker, not by loading the page:
 * reloading brings the highlight back, and only the second press retires it for
 * good. A press also hides it for the rest of the current visit, so it never
 * lingers over a control the user has just used.
 */
export const useModelPickerHighlight = ({
  disabled,
}: UseModelPickerHighlightOptions) => {
  // Resolved once per page load: the highlight must not vanish mid-visit
  // because the stored count moved.
  const [isHighlightVisible, setIsHighlightVisible] = useState<boolean>(
    () =>
      !disabled &&
      Date.now() <= CAMPAIGN_END &&
      readDismissals() < MAX_DISMISSALS
  );

  // Guarded by a ref rather than by the state updater, which must stay pure: a
  // second press within the same visit must not spend a second dismissal.
  const hasCountedDismissalRef = useRef(false);

  const dismissHighlight = useCallback(() => {
    if (!hasCountedDismissalRef.current) {
      hasCountedDismissalRef.current = true;
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, String(readDismissals() + 1));
      } catch {
        // localStorage may be full or unavailable — silently ignore.
      }
    }
    setIsHighlightVisible(false);
  }, []);

  return { isHighlightVisible, dismissHighlight };
};
