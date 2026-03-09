import { useSidekickHighlight } from "@app/components/agent_builder/sidekick/SidekickHighlightContext";
import { useSidekickSuggestions } from "@app/components/agent_builder/sidekick/SidekickSuggestionsContext";
import { Button, CheckIcon, HoveringBar, XMarkIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Suggestion bubble menu positioning constants
const MENU_ABOVE_CURSOR_PX = 80; // Distance above cursor when hovering
const MENU_ABOVE_SUGGESTION_TOP_PX = 5; // Distance above suggestion top when opened without cursor
const MENU_RIGHT_EDGE_PADDING_PX = 20; // Distance from right edge
const MENU_VERTICAL_REPOSITION_THRESHOLD_PX = 380; // Vertical distance before repositioning

interface SuggestionBubbleMenuProps {
  editor: Editor;
  // Used so that menu stays in context with the form
  containerRef: RefObject<HTMLElement | null>;
}

/**
 * Floating action menu for inline suggestions.
 * Shows at cursor when hovering a suggestion. Clears only when leaving the
 * editor area or clicking outside.
 */
export function SuggestionBubbleMenu({
  editor,
  containerRef,
}: SuggestionBubbleMenuProps) {
  const { acceptSuggestion, rejectSuggestion, getSuggestionWithRelations } =
    useSidekickSuggestions();
  const {
    highlightSuggestion,
    highlightedSuggestionId,
    isHighlightedSuggestionPinned,
  } = useSidekickHighlight();

  const [activeMenu, setActiveMenu] = useState<{
    sId: string;
    top: number;
    left: number;
    measured: boolean;
  } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const activeBlockRef = useRef<HTMLElement | null>(null);

  const setPositionAtMouse = useCallback(
    (sId: string, clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const containerRect = container.getBoundingClientRect();

      // Position at fixed right edge of container
      const viewportTop = clientY - MENU_ABOVE_CURSOR_PX;
      const containerRelativeLeft =
        containerRect.width - MENU_RIGHT_EDGE_PADDING_PX;

      setActiveMenu({
        sId,
        top: viewportTop - containerRect.top,
        left: containerRelativeLeft,
        measured: false,
      });
    },
    [containerRef]
  );

  useEffect(() => {
    if (!highlightedSuggestionId) {
      activeBlockRef.current = null;
      setActiveMenu(null);
      return;
    }

    // If a suggestion is highlighted but no menu is shown (e.g., from clicking the eye button),
    // position the menu at the top of the suggestion element
    if (!activeMenu || activeMenu.sId !== highlightedSuggestionId) {
      const suggestionElement = editor.view.dom.querySelector(
        `[data-suggestion-id="${highlightedSuggestionId}"]`
      );

      if (suggestionElement && containerRef.current) {
        const suggestionRect = suggestionElement.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();

        // Position menu just above suggestion top, fixed to right edge
        // When opened without cursor (e.g., from eye button)
        const viewportTop = suggestionRect.top - MENU_ABOVE_SUGGESTION_TOP_PX;
        const containerRelativeLeft =
          containerRect.width - MENU_RIGHT_EDGE_PADDING_PX;

        setActiveMenu({
          sId: highlightedSuggestionId,
          top: viewportTop - containerRect.top,
          left: containerRelativeLeft,
          measured: false,
        });
      }
    }
  }, [highlightedSuggestionId, activeMenu, editor, containerRef]);

  // After menu is in DOM, clamp with real dimensions so it stays inside the form.
  useLayoutEffect(() => {
    const menu =
      activeMenu?.sId === highlightedSuggestionId ? activeMenu : null;
    if (!menu || menu.measured || !menuRef.current || !containerRef.current) {
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportTop = containerRect.top + menu.top;
    const viewportLeft = containerRect.left + menu.left;
    const top = Math.max(
      containerRect.top,
      Math.min(viewportTop, containerRect.bottom - menuRect.height)
    );
    const left = Math.max(
      containerRect.left,
      Math.min(viewportLeft, containerRect.right - menuRect.width)
    );
    setActiveMenu((prev) =>
      prev && !prev.measured
        ? {
            ...prev,
            top: top - containerRect.top,
            left: left - containerRect.left,
            measured: true,
          }
        : prev
    );
  }, [activeMenu, highlightedSuggestionId, containerRef]);

  const clearSelection = useCallback(() => {
    if (!isHighlightedSuggestionPinned) {
      highlightSuggestion(null);
    }
  }, [isHighlightedSuggestionPinned, highlightSuggestion]);

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

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      // Check if mouse has moved far vertically from the current menu position
      let isMouseFarFromMenu = false;
      if (activeMenu && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        // Convert menu position to viewport coordinates
        const menuViewportTop = containerRect.top + activeMenu.top;
        // Calculate vertical distance only
        const verticalDistance = Math.abs(event.clientY - menuViewportTop);
        isMouseFarFromMenu =
          verticalDistance > MENU_VERTICAL_REPOSITION_THRESHOLD_PX;
      }

      const id = getSuggestionId(event.target);
      if (!id) {
        return;
      }

      const isNewSuggestion = id !== highlightedSuggestionId;

      // Reposition if: new suggestion, menu not yet positioned, or mouse is far from menu
      if (isNewSuggestion || isMouseFarFromMenu || !activeMenu) {
        setPositionAtMouse(id, event.clientX, event.clientY);
      }

      // Skip updating highlight only if it's the SAME pinned suggestion
      // Always allow switching to a new suggestion, even if old one was pinned
      if (!isNewSuggestion && isHighlightedSuggestionPinned) {
        return;
      }
      highlightSuggestion(id);
      const blockEl =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>("[data-block-id]")
          : null;
      if (blockEl) {
        activeBlockRef.current = blockEl;
      }
    },
    [
      getSuggestionId,
      highlightedSuggestionId,
      isHighlightedSuggestionPinned,
      highlightSuggestion,
      setPositionAtMouse,
      activeMenu,
      containerRef,
    ]
  );

  useEffect(() => {
    const editorDom = editor.view.dom;
    const container = containerRef.current;

    editorDom.addEventListener("mousemove", handleMouseMove);
    container?.addEventListener("mouseleave", clearSelection);

    return () => {
      editorDom.removeEventListener("mousemove", handleMouseMove);
      container?.removeEventListener("mouseleave", clearSelection);
    };
  }, [editor, containerRef, handleMouseMove, clearSelection]);

  const handleAccept = useCallback(() => {
    if (!highlightedSuggestionId) {
      return;
    }

    const suggestion = getSuggestionWithRelations(highlightedSuggestionId);
    if (!suggestion) {
      return;
    }

    highlightSuggestion(null);
    void acceptSuggestion(suggestion);
  }, [
    highlightedSuggestionId,
    getSuggestionWithRelations,
    acceptSuggestion,
    highlightSuggestion,
  ]);

  const handleReject = useCallback(() => {
    if (!highlightedSuggestionId) {
      return;
    }

    const suggestion = getSuggestionWithRelations(highlightedSuggestionId);
    if (!suggestion) {
      return;
    }

    void rejectSuggestion(suggestion);
    highlightSuggestion(null);
  }, [
    highlightedSuggestionId,
    getSuggestionWithRelations,
    rejectSuggestion,
    highlightSuggestion,
  ]);

  const show = !!activeMenu && activeMenu.sId === highlightedSuggestionId;
  const ready = show && activeMenu.measured;

  if (!show) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: "absolute",
        zIndex: 50,
        top: activeMenu.top,
        left: activeMenu.left,
        visibility: ready ? "visible" : "hidden",
      }}
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
