// biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { Button, CheckIcon, HoveringBar, XMarkIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Grace period before clearing hover state when moving from suggestion to menu
const UNHOVER_GRACE_PERIOD_MS = 150;
// Vertical spacing between suggestion and menu
const MENU_SPACING_PX = 10;

interface SuggestionBubbleMenuProps {
  editor: Editor;
}

/**
 * Floating action menu for inline suggestions.
 *
 * Behavior:
 * - Hover: Menu appears at cursor location, disappears after brief delay when leaving
 * - Click: Pins menu to stay visible until clicking elsewhere
 * - Positioning: Automatically positions above or below to avoid viewport edges and save bar
 */
export function SuggestionBubbleMenu({ editor }: SuggestionBubbleMenuProps) {
  const {
    acceptSuggestion,
    highlightSuggestion,
    highlightedSuggestionId,
    isHighlightedSuggestionPinned,
    rejectSuggestion,
  } = useCopilotSuggestions();

  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    visible: boolean;
  } | null>(null);
  const [measuredMenuHeight, setMeasuredMenuHeight] = useState<number | null>(
    null
  );

  const menuRef = useRef<HTMLDivElement>(null);
  const isMenuHoveredRef = useRef(false);
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!highlightedSuggestionId) {
      hoveredElementRef.current = null;
      return;
    }

    if (isHighlightedSuggestionPinned && !hoveredElementRef.current) {
      hoveredElementRef.current =
        editor.view.dom.querySelector<HTMLElement>(
          `[data-suggestion-id="${highlightedSuggestionId}"]`
        ) ?? null;
    }
  }, [highlightedSuggestionId, isHighlightedSuggestionPinned, editor]);

  const getSuggestionId = useCallback(
    (target: EventTarget | null): string | null => {
      if (!(target instanceof HTMLElement)) {
        return null;
      }
      return (
        target.closest<HTMLElement>("[data-suggestion-id]")?.dataset
          .suggestionId ?? null
      );
    },
    []
  );

  const updateMenuPosition = useCallback(() => {
    const hoveredElement = hoveredElementRef.current;

    if (!highlightedSuggestionId || !hoveredElement) {
      setMenuPosition(null);
      return;
    }

    const wrapper = editor.view.dom.parentElement;
    if (!wrapper) {
      setMenuPosition(null);
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const hoveredRect = hoveredElement.getBoundingClientRect();

    // Don't show menu until we've measured it
    if (!measuredMenuHeight) {
      return;
    }

    // If menu would overflow the bottom of the editor's visible area, show above
    const isNearBottom =
      hoveredRect.bottom + measuredMenuHeight + MENU_SPACING_PX >
      wrapperRect.bottom;

    const menuTop = isNearBottom
      ? hoveredRect.top - wrapperRect.top - measuredMenuHeight - MENU_SPACING_PX
      : hoveredRect.bottom - wrapperRect.top + MENU_SPACING_PX;

    setMenuPosition({
      top: menuTop,
      left: hoveredRect.left - wrapperRect.left,
      visible: true,
    });
  }, [editor, highlightedSuggestionId, measuredMenuHeight]);

  // Measure menu height after it renders and recalculate position if needed
  useLayoutEffect(() => {
    if (menuRef.current && highlightedSuggestionId) {
      const height = menuRef.current.offsetHeight;
      if (height !== measuredMenuHeight) {
        setMeasuredMenuHeight(height);
      }
    }
  }, [highlightedSuggestionId, measuredMenuHeight]);

  useEffect(() => {
    if (highlightedSuggestionId) {
      updateMenuPosition();
    }
  }, [highlightedSuggestionId, updateMenuPosition]);

  const cancelClear = useCallback(() => {
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
  }, []);

  const clearSelection = useCallback(() => {
    if (!isHighlightedSuggestionPinned) {
      clearTimeoutRef.current ??= setTimeout(() => {
        highlightSuggestion(null);
        clearTimeoutRef.current = null;
      }, UNHOVER_GRACE_PERIOD_MS);
    }
  }, [isHighlightedSuggestionPinned, highlightSuggestion]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (isHighlightedSuggestionPinned) {
        return;
      }

      const target = event.target;
      const id = getSuggestionId(target);

      if (id && target instanceof HTMLElement) {
        hoveredElementRef.current =
          target.closest<HTMLElement>("[data-suggestion-id]") ?? null;
        cancelClear();
        highlightSuggestion(id);
        updateMenuPosition();
      } else if (!isMenuHoveredRef.current) {
        hoveredElementRef.current = null;
        clearSelection();
      }
    },
    [
      getSuggestionId,
      isHighlightedSuggestionPinned,
      cancelClear,
      clearSelection,
      highlightSuggestion,
      updateMenuPosition,
    ]
  );

  const handleClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target;
      const id = getSuggestionId(target);

      if (id && target instanceof HTMLElement) {
        hoveredElementRef.current =
          target.closest<HTMLElement>("[data-suggestion-id]") ?? null;
        cancelClear();
        highlightSuggestion(id, true);
        updateMenuPosition();
      } else {
        hoveredElementRef.current = null;
        highlightSuggestion(null);
      }
    },
    [getSuggestionId, cancelClear, highlightSuggestion, updateMenuPosition]
  );

  useEffect(() => {
    const editorDom = editor.view.dom;
    editorDom.addEventListener("mousemove", handleMouseMove);
    editorDom.addEventListener("click", handleClick);

    return () => {
      editorDom.removeEventListener("mousemove", handleMouseMove);
      editorDom.removeEventListener("click", handleClick);
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
    };
  }, [editor, handleMouseMove, handleClick]);

  useEffect(() => {
    if (!highlightedSuggestionId) {
      return;
    }

    const editorDom = editor.view.dom;
    const handlePositionChange = () => updateMenuPosition();

    editorDom.addEventListener("scroll", handlePositionChange);
    window.addEventListener("resize", handlePositionChange);

    return () => {
      editorDom.removeEventListener("scroll", handlePositionChange);
      window.removeEventListener("resize", handlePositionChange);
    };
  }, [highlightedSuggestionId, editor, updateMenuPosition]);

  const handleAccept = useCallback(() => {
    if (!highlightedSuggestionId) {
      return;
    }
    void acceptSuggestion(highlightedSuggestionId);
    highlightSuggestion(null);
  }, [highlightedSuggestionId, acceptSuggestion, highlightSuggestion]);

  const handleReject = useCallback(() => {
    if (!highlightedSuggestionId) {
      return;
    }
    void rejectSuggestion(highlightedSuggestionId);
    highlightSuggestion(null);
  }, [highlightedSuggestionId, rejectSuggestion, highlightSuggestion]);

  const handleMenuMouseEnter = useCallback(() => {
    isMenuHoveredRef.current = true;
    cancelClear();
  }, [cancelClear]);

  const handleMenuMouseLeave = useCallback(() => {
    isMenuHoveredRef.current = false;
    clearSelection();
  }, [clearSelection]);

  if (!highlightedSuggestionId) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: "absolute",
        top: menuPosition?.top ?? 0,
        left: menuPosition?.left ?? 0,
        zIndex: 50,
        visibility: menuPosition?.visible ? "visible" : "hidden",
      }}
      onMouseEnter={handleMenuMouseEnter}
      onMouseLeave={handleMenuMouseLeave}
    >
      <HoveringBar size="xs">
        <Button
          icon={XMarkIcon}
          size="xs"
          variant="ghost"
          tooltip="Reject suggestion"
          label="Reject"
          onClick={handleReject}
        />
        <HoveringBar.Separator />
        <Button
          icon={CheckIcon}
          size="xs"
          variant="highlight"
          tooltip="Accept suggestion"
          label="Accept"
          onClick={handleAccept}
        />
      </HoveringBar>
    </div>
  );
}
