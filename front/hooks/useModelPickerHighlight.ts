import { useCallback, useEffect, useRef, useState } from "react";

const LOCAL_STORAGE_KEY = "modelPickerHighlightViews";

// Temporary discovery treatment: after two page loads showing the highlight, the
// control is assumed to have been noticed and it never comes back.
const MAX_VIEWS = 2;

// The campaign runs for two weeks. Encoded as a date rather than left to a
// manual revert so it dies on its own even if the code outlives the campaign —
// otherwise someone signing up in three months would still be nudged.
const CAMPAIGN_END = Date.parse("2026-08-26T23:59:59Z");

function readViews(): number {
  if (typeof window === "undefined") {
    return MAX_VIEWS;
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
    return MAX_VIEWS;
  }
}

interface UseModelPickerHighlightOptions {
  // Surfaces that opt out keep their view count untouched, so disabling one does
  // not silently spend the allowance meant for another.
  disabled: boolean;
}

/**
 * Visibility of the model picker's discovery highlight, capped at `MAX_VIEWS`
 * page loads per browser and expiring at `CAMPAIGN_END`.
 *
 * The count is spent per page load rather than per click, so a user who never
 * clicks the picker still stops seeing it. Dismissal is deliberately
 * session-scoped: clicking retires the highlight for the rest of the visit, and
 * the stored count decides whether it returns on the next load.
 */
export const useModelPickerHighlight = ({
  disabled,
}: UseModelPickerHighlightOptions) => {
  // Resolved once per page load: the highlight must not vanish mid-visit
  // because the stored count moved.
  const [isHighlightVisible, setIsHighlightVisible] = useState<boolean>(
    () => !disabled && Date.now() <= CAMPAIGN_END && readViews() < MAX_VIEWS
  );
  const hasCountedViewRef = useRef(false);

  useEffect(() => {
    if (!isHighlightVisible || hasCountedViewRef.current) {
      return;
    }
    hasCountedViewRef.current = true;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, String(readViews() + 1));
    } catch {
      // localStorage may be full or unavailable — silently ignore.
    }
  }, [isHighlightVisible]);

  const dismissHighlight = useCallback(() => {
    setIsHighlightVisible(false);
  }, []);

  return { isHighlightVisible, dismissHighlight };
};
