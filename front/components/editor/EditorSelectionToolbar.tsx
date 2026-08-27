import { cn } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const TOOLBAR_Z_INDEX = 60;
const SELECTION_GAP_PX = 8;

interface Position {
  top: number;
  left: number;
}

function readSelectionPosition(editor: Editor): Position | null {
  const { state, view } = editor;
  if (!view.hasFocus() || state.selection.empty) {
    return null;
  }

  const { from, to } = state.selection;
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to, -1);

  return {
    top: Math.min(start.top, end.top) - SELECTION_GAP_PX,
    left:
      (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2,
  };
}

interface EditorSelectionToolbarProps {
  editor: Editor | null;
  children: ReactNode;
  disabled?: boolean;
}

/**
 * Floating formatting toolbar anchored above the current text selection.
 *
 * @summary Selection-anchored formatting toolbar.
 */
export function EditorSelectionToolbar({
  editor,
  children,
  disabled = false,
}: EditorSelectionToolbarProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const [hasEntered, setHasEntered] = useState(false);

  const syncPosition = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      setPosition(null);
      return;
    }
    setPosition(readSelectionPosition(editor));
  }, [editor]);

  useEffect(() => {
    if (!editor || disabled) {
      setPosition(null);
      return;
    }

    editor.on("transaction", syncPosition);
    editor.on("focus", syncPosition);
    editor.on("blur", syncPosition);

    return () => {
      editor.off("transaction", syncPosition);
      editor.off("focus", syncPosition);
      editor.off("blur", syncPosition);
    };
  }, [editor, disabled, syncPosition]);

  useEffect(() => {
    if (!position) {
      return;
    }

    window.addEventListener("scroll", syncPosition, true);
    window.addEventListener("resize", syncPosition);

    return () => {
      window.removeEventListener("scroll", syncPosition, true);
      window.removeEventListener("resize", syncPosition);
    };
  }, [position, syncPosition]);

  useLayoutEffect(() => {
    if (!position) {
      setHasEntered(false);
      return;
    }

    const frame = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [position]);

  if (!position) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "fixed -translate-x-1/2 -translate-y-full",
        "origin-bottom transition-[opacity,scale] duration-100 ease-out-quart",
        "motion-reduce:transition-none",
        hasEntered ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
      )}
      style={{
        top: position.top,
        left: position.left,
        zIndex: TOOLBAR_Z_INDEX,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </div>,
    document.body
  );
}
