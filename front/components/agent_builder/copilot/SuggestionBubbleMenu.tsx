import { useCopilotHighlight } from "@app/components/agent_builder/copilot/CopilotHighlightContext";
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { getSuggestionEndPosition } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
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

const MENU_SPACING_PX = 10;

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
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const {
    highlightSuggestion,
    highlightedSuggestionId,
    isHighlightedSuggestionPinned,
  } = useCopilotHighlight();

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
      const viewportTop = clientY + MENU_SPACING_PX;
      const viewportLeft = clientX + MENU_SPACING_PX;
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      setActiveMenu({
        sId,
        top: viewportTop - containerRect.top,
        left: viewportLeft - containerRect.left,
        measured: false,
      });
    },
    [containerRef]
  );

  const setPositionAtSuggestion = useCallback(
    (sId: string) => {
      const endPos = getSuggestionEndPosition(editor, sId);
      const container = containerRef.current;
      if (endPos === null || !container) {
        return;
      }
      const coordsPos = endPos > 0 ? endPos - 1 : endPos;
      const coords = editor.view.coordsAtPos(coordsPos);
      const viewportTop = coords.bottom + MENU_SPACING_PX;
      const viewportLeft = coords.right + MENU_SPACING_PX;

      const containerRect = container.getBoundingClientRect();
      setActiveMenu({
        sId,
        top: viewportTop - containerRect.top,
        left: viewportLeft - containerRect.left,
        measured: false,
      });
    },
    [editor, containerRef]
  );

  useEffect(() => {
    if (!highlightedSuggestionId) {
      activeBlockRef.current = null;
      setActiveMenu(null);
    }
  }, [highlightedSuggestionId]);

  useLayoutEffect(() => {
    if (!highlightedSuggestionId || !isHighlightedSuggestionPinned) {
      return;
    }

    const suggestionEl = editor.view.dom.querySelector<HTMLElement>(
      `[data-suggestion-id="${highlightedSuggestionId}"]`
    );
    const blockEl = suggestionEl?.closest<HTMLElement>("[data-block-id]");
    if (blockEl) {
      activeBlockRef.current = blockEl;
      blockEl.scrollIntoView({ behavior: "auto", block: "center" });
    }
    setPositionAtSuggestion(highlightedSuggestionId);
  }, [
    highlightedSuggestionId,
    isHighlightedSuggestionPinned,
    editor,
    setPositionAtSuggestion,
  ]);

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
      if (isHighlightedSuggestionPinned) {
        return;
      }

      const id = getSuggestionId(event.target);
      if (!id) {
        return;
      }

      const isNewSuggestion = id !== highlightedSuggestionId;
      highlightSuggestion(id);
      const blockEl =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>("[data-block-id]")
          : null;
      if (blockEl) {
        activeBlockRef.current = blockEl;
      }
      if (isNewSuggestion) {
        setPositionAtMouse(id, event.clientX, event.clientY);
      }
    },
    [
      getSuggestionId,
      highlightedSuggestionId,
      isHighlightedSuggestionPinned,
      highlightSuggestion,
      setPositionAtMouse,
    ]
  );

  const handleClick = useCallback(
    (event: MouseEvent) => {
      const id = getSuggestionId(event.target);
      if (id) {
        highlightSuggestion(id, true);
        const blockEl =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>("[data-block-id]")
            : null;
        if (blockEl) {
          activeBlockRef.current = blockEl;
        }
        setPositionAtMouse(id, event.clientX, event.clientY);
      } else {
        clearSelection();
      }
    },
    [getSuggestionId, highlightSuggestion, setPositionAtMouse, clearSelection]
  );

  useEffect(() => {
    const editorDom = editor.view.dom;
    const container = containerRef.current;

    editorDom.addEventListener("mousemove", handleMouseMove);
    editorDom.addEventListener("click", handleClick);
    container?.addEventListener("mouseleave", clearSelection);

    return () => {
      editorDom.removeEventListener("mousemove", handleMouseMove);
      editorDom.removeEventListener("click", handleClick);
      container?.removeEventListener("mouseleave", clearSelection);
    };
  }, [editor, containerRef, handleMouseMove, handleClick, clearSelection]);

  const handleAccept = useCallback(() => {
    if (!highlightedSuggestionId) {
      return;
    }
    highlightSuggestion(null);
    void acceptSuggestion(highlightedSuggestionId);
  }, [highlightedSuggestionId, acceptSuggestion, highlightSuggestion]);

  const handleReject = useCallback(() => {
    if (!highlightedSuggestionId) {
      return;
    }
    void rejectSuggestion(highlightedSuggestionId);
    highlightSuggestion(null);
  }, [highlightedSuggestionId, rejectSuggestion, highlightSuggestion]);

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
