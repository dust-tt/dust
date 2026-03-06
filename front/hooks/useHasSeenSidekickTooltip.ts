import logger from "@app/logger/logger";
import { useCallback, useEffect, useState } from "react";

const SIDEKICK_TOOLTIP_STORAGE_KEY = "dust-sidekick-tooltip-seen-count";
const SIDEKICK_TOOLTIP_MAX_SHOW_COUNT = 5;

export function useHasSeenSidekickTooltip(): {
  hasSeen: boolean;
  markAsSeen: () => void;
} {
  // Default to true before hydration to prevent flash-open on SSR.
  const [hasSeen, setHasSeen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = localStorage.getItem(SIDEKICK_TOOLTIP_STORAGE_KEY);
      const count = stored !== null ? parseInt(stored, 10) : 0;
      const seen = count >= SIDEKICK_TOOLTIP_MAX_SHOW_COUNT;
      logger.info(
        { count, seen },
        "useHasSeenSidekickTooltip: read from localStorage"
      );
      setHasSeen(seen);
    } catch (err) {
      logger.error(
        { err },
        "useHasSeenSidekickTooltip: failed to read from localStorage"
      );
      setHasSeen(true);
    }
  }, []);

  const markAsSeen = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = localStorage.getItem(SIDEKICK_TOOLTIP_STORAGE_KEY);
      const count = stored !== null ? parseInt(stored, 10) : 0;
      const newCount = count + 1;
      localStorage.setItem(SIDEKICK_TOOLTIP_STORAGE_KEY, String(newCount));
      logger.info(
        { count: newCount },
        "useHasSeenSidekickTooltip: incremented count in localStorage"
      );
      if (newCount >= SIDEKICK_TOOLTIP_MAX_SHOW_COUNT) {
        setHasSeen(true);
      }
    } catch (err) {
      logger.error(
        { err },
        "useHasSeenSidekickTooltip: failed to write to localStorage"
      );
    }
  }, []);

  return { hasSeen, markAsSeen };
}
