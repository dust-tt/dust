import { Button, CheckIcon, HoveringBar, XMarkIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";

interface SuggestionBubbleMenuProps {
  editor: Editor;
}

/**
 * Floating menu for suggestion actions.
 * - Click on suggestion: stays selected until click elsewhere or action taken
 * - Hover without selection: last hovered suggestion stays until you hover another
 */
export function SuggestionBubbleMenu({ editor }: SuggestionBubbleMenuProps) {
  const suggestionsContext = useCopilotSuggestions();
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<
    string | null
  >(null);
  const [hoveredSuggestionId, setHoveredSuggestionId] = useState<string | null>(
    null
  );
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    isVisible: boolean;
  } | null>(null);
  const activeSuggestionIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // Selected takes priority over hovered.
  const activeSuggestionId = selectedSuggestionId ?? hoveredSuggestionId;

  useEffect(() => {
    activeSuggestionIdRef.current = activeSuggestionId;
  }, [activeSuggestionId]);

  // Find the scrollable container on mount.
  useEffect(() => {
    const scrollable = editor.view.dom.closest<HTMLElement>(".overflow-auto");
    containerRef.current = scrollable;
  }, [editor]);

  // Get suggestion ID from a target element.
  const getSuggestionId = useCallback(
    (target: EventTarget | null): string | null => {
      if (!(target instanceof HTMLElement)) {
        return null;
      }

      const element = target.closest<HTMLElement>("[data-suggestion-id]");
      return element?.dataset.suggestionId ?? null;
    },
    []
  );

  // Calculate the combined bounding rect of all elements with the given suggestion ID.
  const getSuggestionBoundingRect = useCallback(
    (suggestionId: string): DOMRect | null => {
      const elements = editor.view.dom.querySelectorAll<HTMLElement>(
        `[data-suggestion-id="${suggestionId}"]`
      );

      if (elements.length === 0) {
        return null;
      }

      let minLeft = Infinity;
      let minTop = Infinity;
      let maxRight = -Infinity;
      let maxBottom = -Infinity;

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        minLeft = Math.min(minLeft, rect.left);
        minTop = Math.min(minTop, rect.top);
        maxRight = Math.max(maxRight, rect.right);
        maxBottom = Math.max(maxBottom, rect.bottom);
      }

      return new DOMRect(
        minLeft,
        minTop,
        maxRight - minLeft,
        maxBottom - minTop
      );
    },
    [editor]
  );

  const updateMenuPosition = useCallback(() => {
    const suggestionId = activeSuggestionIdRef.current;
    if (!suggestionId) {
      setMenuPosition(null);
      return;
    }

    const rect = getSuggestionBoundingRect(suggestionId);
    if (!rect) {
      setMenuPosition(null);
      return;
    }

    const container = containerRef.current;

    // Check if suggestion is visible within the scrollable container.
    let isVisible = true;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      isVisible =
        rect.bottom > containerRect.top && rect.top < containerRect.bottom;
    }

    // Position at bottom-left of the combined suggestion block.
    setMenuPosition({
      top: rect.bottom + 8,
      left: rect.left,
      isVisible,
    });
  }, [getSuggestionBoundingRect]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const id = getSuggestionId(event.target);

      if (id) {
        setHoveredSuggestionId((prev) => (prev === id ? prev : id));
      }
    },
    [getSuggestionId]
  );

  const handleClick = useCallback(
    (event: MouseEvent) => {
      const id = getSuggestionId(event.target);

      if (id) {
        setSelectedSuggestionId(id);
      } else {
        setSelectedSuggestionId(null);
      }
    },
    [getSuggestionId]
  );

  // Attach mouse event listeners.
  useEffect(() => {
    const editorElement = editor.view.dom;

    editorElement.addEventListener("mousemove", handleMouseMove);
    editorElement.addEventListener("click", handleClick);

    return () => {
      editorElement.removeEventListener("mousemove", handleMouseMove);
      editorElement.removeEventListener("click", handleClick);
    };
  }, [editor, handleMouseMove, handleClick]);

  // Update position when active suggestion changes.
  useEffect(() => {
    updateMenuPosition();
  }, [activeSuggestionId, updateMenuPosition]);

  // Update position on scroll (any scrollable parent).
  useEffect(() => {
    if (!activeSuggestionId) {
      return;
    }

    const handleScroll = () => {
      updateMenuPosition();
    };

    // Listen on window for any scroll event (capture phase to catch all).
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [activeSuggestionId, updateMenuPosition]);

  // Update the editor's highlighted suggestion.
  useEffect(() => {
    editor.commands.setHighlightedSuggestion(activeSuggestionId);
  }, [editor, activeSuggestionId]);

  const handleAccept = useCallback(() => {
    if (activeSuggestionId && suggestionsContext) {
      suggestionsContext.acceptSuggestion(activeSuggestionId);
      setSelectedSuggestionId(null);
      setHoveredSuggestionId(null);
    }
  }, [activeSuggestionId, suggestionsContext]);

  const handleReject = useCallback(() => {
    if (activeSuggestionId && suggestionsContext) {
      suggestionsContext.rejectSuggestion(activeSuggestionId);
      setSelectedSuggestionId(null);
      setHoveredSuggestionId(null);
    }
  }, [activeSuggestionId, suggestionsContext]);

  if (
    !suggestionsContext ||
    !activeSuggestionId ||
    !menuPosition ||
    !menuPosition.isVisible
  ) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: menuPosition.top,
        left: menuPosition.left,
        zIndex: 50,
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
