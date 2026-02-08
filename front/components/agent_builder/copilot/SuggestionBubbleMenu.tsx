import { Button, CheckIcon, HoveringBar, XMarkIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";

const UNHOVER_DELAY_MS = 1000;
const MENU_SPACING_PX = 8;
const VISIBILITY_BUFFER_PX = 50;

interface SuggestionBubbleMenuProps {
  editor: Editor;
}

/**
 * Floating action menu for inline suggestions.
 *
 * Behavior:
 * - Appears when hovering over a suggestion decoration
 * - Stays open when moving mouse to menu (with brief delay grace period)
 * - Clears on click outside suggestions
 * - Positions itself below the suggestion content
 */
export function SuggestionBubbleMenu({ editor }: SuggestionBubbleMenuProps) {
  const suggestionsContext = useCopilotSuggestions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    visible: boolean;
  } | null>(null);

  const activeIdRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    const elements = editorDom.querySelectorAll<HTMLElement>(
      `[data-suggestion-id="${suggestionId}"]`
    );

    if (elements.length === 0) {
      setMenuPosition(null);
      return;
    }

    const editorRect = editorDom.getBoundingClientRect();

    // Find bounds of all suggestion elements.
    let maxBottom = -Infinity;
    let minLeft = Infinity;
    let minTop = Infinity;

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      maxBottom = Math.max(maxBottom, rect.bottom);
      minLeft = Math.min(minLeft, rect.left);
      minTop = Math.min(minTop, rect.top);
    }

    const visible =
      maxBottom > editorRect.top &&
      minTop < editorRect.bottom &&
      maxBottom <= editorRect.bottom + VISIBILITY_BUFFER_PX;

    const wrapper = editorDom.parentElement;
    if (!wrapper) {
      setMenuPosition(null);
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();

    setMenuPosition({
      top: maxBottom - wrapperRect.top + MENU_SPACING_PX,
      left: minLeft - wrapperRect.left,
      visible,
    });
  }, [editor]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const id = getSuggestionId(event.target);
      const isOverMenu =
        menuRef.current &&
        event.target instanceof Node &&
        menuRef.current.contains(event.target);

      if (id || isOverMenu) {
        if (clearTimeoutRef.current) {
          clearTimeout(clearTimeoutRef.current);
          clearTimeoutRef.current = null;
        }
        if (id) {
          setActiveId(id);
        }
      } else {
        // Start delayed clear to allow moving from suggestion to menu.
        clearTimeoutRef.current ??= setTimeout(() => {
          setActiveId(null);
          clearTimeoutRef.current = null;
        }, UNHOVER_DELAY_MS);
      }
    },
    [getSuggestionId]
  );

  // On click, set activeId (clears if clicking outside suggestions).
  const handleClick = useCallback(
    (event: MouseEvent) => {
      const id = getSuggestionId(event.target);
      setActiveId(id);
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
    const handleScroll = () => updateMenuPosition();

    editorDom.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);

    return () => {
      editorDom.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [activeId, editor, updateMenuPosition]);

  useEffect(() => {
    editor.commands.setHighlightedSuggestion(activeId);
  }, [editor, activeId]);

  const handleAccept = useCallback(() => {
    if (activeId && suggestionsContext) {
      // Intentionally ignoring the result as we want to not block the user if suggestions are outdated.
      void suggestionsContext.acceptSuggestion(activeId);
      setActiveId(null);
    }
  }, [activeId, suggestionsContext]);

  const handleReject = useCallback(() => {
    if (activeId && suggestionsContext) {
      // Intentionally ignoring the result as we want to not block the user if suggestions are outdated.
      void suggestionsContext.rejectSuggestion(activeId);
      setActiveId(null);
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
      ref={menuRef}
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
