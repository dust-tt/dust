import { useCallback, useEffect, useRef, useState } from "react";

const SCROLL_COMPACT_THRESHOLD_PX = 12;
const SCROLL_COMPACT_DEBOUNCE_MS = 150;
const EXPAND_SCROLL_GRACE_MS = 300;

interface UseInputBarCompactModeOptions {
  enabled: boolean;
}

export function useInputBarCompactMode({
  enabled,
}: UseInputBarCompactModeOptions) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const isInteractingRef = useRef(false);
  isInteractingRef.current = isEditorFocused || isOverlayOpen || isVoiceActive;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  const listOffsetRef = useRef(0);
  const prevListOffsetRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreScrollUntilRef = useRef(0);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsExpanded(true);
      // Re-seed the baseline off the first offset seen once scroll matters again.
      prevListOffsetRef.current = null;
      ignoreScrollUntilRef.current = 0;
    }
  }, [enabled]);

  // Called on every scroll frame by InputBarScrollCollapseWatcher, so it stays a
  // stable callback reading its inputs from refs: nothing here may re-render the
  // input bar until the debounce actually fires.
  const onListOffsetChange = useCallback((listOffset: number) => {
    listOffsetRef.current = listOffset;

    if (!enabledRef.current) {
      return;
    }

    if (prevListOffsetRef.current === null) {
      prevListOffsetRef.current = listOffset;
      return;
    }

    // Only use scroll to enter compact while the bar is expanded. While compact,
    // keep the baseline in sync but ignore deltas (layout noise from footer size).
    if (!isExpandedRef.current) {
      prevListOffsetRef.current = listOffset;
      return;
    }

    // Ignore layout-induced listOffset shifts right after an explicit expand.
    if (Date.now() < ignoreScrollUntilRef.current) {
      prevListOffsetRef.current = listOffset;
      return;
    }

    const delta = Math.abs(listOffset - prevListOffsetRef.current);
    prevListOffsetRef.current = listOffset;

    if (delta < SCROLL_COMPACT_THRESHOLD_PX) {
      return;
    }

    if (isInteractingRef.current) {
      return;
    }

    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }

    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null;
      if (!isInteractingRef.current) {
        setIsExpanded(false);
      }
    }, SCROLL_COMPACT_DEBOUNCE_MS);
  }, []);

  const isScrolledCompactIntent = enabled && !isExpanded;
  const effectiveIsCompact =
    isScrolledCompactIntent && !isEditorFocused && !isOverlayOpen;

  const expandInputBar = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    prevListOffsetRef.current = listOffsetRef.current;
    ignoreScrollUntilRef.current = Date.now() + EXPAND_SCROLL_GRACE_MS;
    setIsExpanded(true);
  }, []);

  return {
    effectiveIsCompact,
    expandInputBar,
    onListOffsetChange,
    onEditorFocusChange: setIsEditorFocused,
    onOverlayOpenChange: setIsOverlayOpen,
    onVoiceActiveChange: setIsVoiceActive,
  };
}
