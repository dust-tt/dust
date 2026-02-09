import { Button, CheckIcon, HoveringBar, XMarkIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";

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
  const suggestionsContext = useCopilotSuggestions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    visible: boolean;
  } | null>(null);
  const [measuredMenuHeight, setMeasuredMenuHeight] = useState<number | null>(
    null
  );

  const activeIdRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMenuHoveredRef = useRef(false);
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

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
    const suggestionId = activeIdRef.current;
    const hoveredElement = hoveredElementRef.current;

    if (!suggestionId || !hoveredElement) {
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
  }, [editor, measuredMenuHeight]);

  // Measure menu height after it renders and recalculate position if needed
  useLayoutEffect(() => {
    if (menuRef.current && activeId) {
      const height = menuRef.current.offsetHeight;
      if (height !== measuredMenuHeight) {
        setMeasuredMenuHeight(height);
      }
    }
  }, [activeId, measuredMenuHeight]);

  useEffect(() => {
    if (activeId) {
      updateMenuPosition();
    }
  }, [activeId, updateMenuPosition]);

  const cancelClear = useCallback(() => {
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
  }, []);

  const clearSelection = useCallback(() => {
    if (!isPinned) {
      clearTimeoutRef.current ??= setTimeout(() => {
        setActiveId(null);
        clearTimeoutRef.current = null;
      }, UNHOVER_GRACE_PERIOD_MS);
    }
  }, [isPinned]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (isPinned) {
        return;
      }

      const target = event.target;
      const id = getSuggestionId(target);

      if (id && target instanceof HTMLElement) {
        const suggestionElement = target.closest<HTMLElement>(
          "[data-suggestion-id]"
        );
        hoveredElementRef.current = suggestionElement;
        cancelClear();
        setActiveId(id);
        updateMenuPosition();
      } else if (!isMenuHoveredRef.current) {
        hoveredElementRef.current = null;
        clearSelection();
      }
    },
    [getSuggestionId, isPinned, cancelClear, clearSelection, updateMenuPosition]
  );

  const handleClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target;
      const id = getSuggestionId(target);

      if (id && target instanceof HTMLElement) {
        const suggestionElement = target.closest<HTMLElement>(
          "[data-suggestion-id]"
        );
        hoveredElementRef.current = suggestionElement;
        cancelClear();
        setActiveId(id);
        setIsPinned(true);
        updateMenuPosition();
      } else {
        hoveredElementRef.current = null;
        setIsPinned(false);
        setActiveId(null);
      }
    },
    [getSuggestionId, cancelClear, updateMenuPosition]
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
    updateMenuPosition();
  }, [activeId, updateMenuPosition]);

  useEffect(() => {
    if (!activeId) {
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
  }, [activeId, editor, updateMenuPosition]);

  useEffect(() => {
    editor.commands.setHighlightedSuggestion(activeId);
  }, [editor, activeId]);

  const handleAccept = useCallback(() => {
    if (!activeId || !suggestionsContext) {
      return;
    }
    void suggestionsContext.acceptSuggestion(activeId);
    setActiveId(null);
    setIsPinned(false);
  }, [activeId, suggestionsContext]);

  const handleReject = useCallback(() => {
    if (!activeId || !suggestionsContext) {
      return;
    }
    void suggestionsContext.rejectSuggestion(activeId);
    setActiveId(null);
    setIsPinned(false);
  }, [activeId, suggestionsContext]);

  const handleMenuMouseEnter = useCallback(() => {
    isMenuHoveredRef.current = true;
    cancelClear();
  }, [cancelClear]);

  const handleMenuMouseLeave = useCallback(() => {
    isMenuHoveredRef.current = false;
    clearSelection();
  }, [clearSelection]);

  if (!suggestionsContext || !activeId) {
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
