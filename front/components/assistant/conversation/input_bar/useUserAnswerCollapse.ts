import { useCallback, useEffect, useRef, useState } from "react";

// Hysteresis around the bottom of the conversation: the card collapses once the
// reader has scrolled further than this from the bottom...
const SCROLL_COLLAPSE_THRESHOLD_PX = 120;
// ...and expands again once they are back within this distance of it.
const SCROLL_EXPAND_THRESHOLD_PX = 24;
// Toggling changes the composer height, which shifts the scroll location.
// Ignore location updates for a short window so that shift is not mistaken
// for the user scrolling.
const TOGGLE_SCROLL_GRACE_MS = 300;

interface UseUserAnswerCollapseOptions {
  // Identifies the question currently shown in the composer, null when the
  // composer is not in ask-question mode. The collapsed state resets whenever
  // a different question takes over.
  questionId: string | null;
  // Distance in px between the bottom of the message list and the bottom of
  // the viewport, as reported by Virtuoso (0 when scrolled to the bottom).
  bottomOffset: number;
}

// Collapses the ask-question card while the reader scrolls up through the
// conversation and expands it again when they reach the bottom. The manual
// toggle wins in between: auto-collapse/expand only fire on the transition
// between "at the bottom" and "scrolled away".
export function useUserAnswerCollapse({
  questionId,
  bottomOffset,
}: UseUserAnswerCollapseOptions) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isAtBottomRef = useRef(true);
  const ignoreScrollUntilRef = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: questionId is an intentional reset trigger
  useEffect(() => {
    setIsCollapsed(false);
    isAtBottomRef.current = true;
    ignoreScrollUntilRef.current = 0;
  }, [questionId]);

  useEffect(() => {
    if (questionId === null) {
      return;
    }

    if (Date.now() < ignoreScrollUntilRef.current) {
      return;
    }

    if (isAtBottomRef.current && bottomOffset > SCROLL_COLLAPSE_THRESHOLD_PX) {
      isAtBottomRef.current = false;
      setIsCollapsed(true);
    } else if (
      !isAtBottomRef.current &&
      bottomOffset < SCROLL_EXPAND_THRESHOLD_PX
    ) {
      isAtBottomRef.current = true;
      setIsCollapsed(false);
    }
  }, [questionId, bottomOffset]);

  const toggleCollapsed = useCallback(() => {
    ignoreScrollUntilRef.current = Date.now() + TOGGLE_SCROLL_GRACE_MS;
    setIsCollapsed((prev) => !prev);
  }, []);

  return { isCollapsed, toggleCollapsed };
}
