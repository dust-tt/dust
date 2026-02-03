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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    visible: boolean;
  } | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const activeId = selectedId ?? hoveredId;

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
    if (!suggestionId) {
      setMenuPosition(null);
      return;
    }

    const editorDom = editor.view.dom;

    // Find all elements for this suggestion.
    const elements = editorDom.querySelectorAll<HTMLElement>(
      `[data-suggestion-id="${suggestionId}"]`
    );

    if (elements.length === 0) {
      setMenuPosition(null);
      return;
    }

    // Get the editor's bounding rect (the scrollable container).
    const editorRect = editorDom.getBoundingClientRect();

    // Find the combined bounds of all suggestion elements.
    let maxBottom = -Infinity;
    let minLeft = Infinity;
    let minTop = Infinity;

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      maxBottom = Math.max(maxBottom, rect.bottom);
      minLeft = Math.min(minLeft, rect.left);
      minTop = Math.min(minTop, rect.top);
    }

    // Check if suggestion is visible within the editor viewport.
    const visible =
      maxBottom > editorRect.top &&
      minTop < editorRect.bottom &&
      maxBottom <= editorRect.bottom + 50; // Allow menu to show if suggestion bottom is near viewport bottom

    // Position relative to the editor's parent wrapper (which has position: relative).
    // We need to account for the editor's position within the wrapper.
    const wrapper = editorDom.parentElement;
    if (!wrapper) {
      setMenuPosition(null);
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();

    setMenuPosition({
      top: maxBottom - wrapperRect.top + 8,
      left: minLeft - wrapperRect.left,
      visible,
    });
  }, [editor]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const id = getSuggestionId(event.target);
      if (id) {
        setHoveredId(id);
      }
    },
    [getSuggestionId]
  );

  const handleClick = useCallback(
    (event: MouseEvent) => {
      const id = getSuggestionId(event.target);
      setSelectedId(id);
    },
    [getSuggestionId]
  );

  useEffect(() => {
    const el = editor.view.dom;
    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("click", handleClick);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("click", handleClick);
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
    const handleScroll = () => updateMenuPosition();

    editorDom.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);

    return () => {
      editorDom.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [activeId, editor, updateMenuPosition]);

  // Update the editor's highlighted suggestion.
  useEffect(() => {
    editor.commands.setHighlightedSuggestion(activeId);
  }, [editor, activeId]);

  const handleAccept = useCallback(() => {
    if (activeId && suggestionsContext) {
      suggestionsContext.acceptSuggestion(activeId);
      setSelectedId(null);
      setHoveredId(null);
    }
  }, [activeId, suggestionsContext]);

  const handleReject = useCallback(() => {
    if (activeId && suggestionsContext) {
      suggestionsContext.rejectSuggestion(activeId);
      setSelectedId(null);
      setHoveredId(null);
    }
  }, [activeId, suggestionsContext]);

  if (
    !suggestionsContext ||
    !activeId ||
    !menuPosition ||
    !menuPosition.visible
  ) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
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
