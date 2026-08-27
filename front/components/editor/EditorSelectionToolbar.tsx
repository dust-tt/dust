import { cn } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

// Above the z-50 overlay band used by dialogs and popovers, which are body
// portals appended after this one and would win an equal-z tie by DOM order.
const TOOLBAR_Z_INDEX = 60;
// Gap between the selection and the toolbar, in pixels.
const SELECTION_GAP_PX = 8;

interface Position {
  top: number;
  left: number;
}

/**
 * Viewport position centered above the current text selection, or null when
 * there is nothing to show a toolbar for.
 *
 * Read straight from ProseMirror's `coordsAtPos` (already viewport-relative),
 * so the result is independent of any ancestor's overflow, transform, or
 * filter — the things that made tiptap's own BubbleMenu land unpredictably
 * inside the input bar.
 */
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
  /** When true the toolbar never renders (e.g. on touch devices). */
  disabled?: boolean;
}

/**
 * Floating formatting toolbar shown above the current selection.
 *
 * Replaces tiptap's `BubbleMenu`, which owns the menu element outside React
 * and manages its position, `position`/`visibility` styles and DOM parent
 * itself. Rendering it as a plain portal keeps all of that in one place:
 * the toolbar is a direct child of `document.body`, positioned `fixed` from
 * viewport coordinates, so no ancestor can clip it, shift its containing
 * block, or paint over it.
 *
 * @summary Selection-anchored formatting toolbar.
 */
export function EditorSelectionToolbar({
  editor,
  children,
  disabled = false,
}: EditorSelectionToolbarProps) {
  const [position, setPosition] = useState<Position | null>(null);
  // Drives the enter transition: the toolbar mounts already positioned, then
  // flips to its resting state on the next frame so the browser has a start
  // value to animate from.
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

    editor.on("selectionUpdate", syncPosition);
    editor.on("transaction", syncPosition);
    editor.on("focus", syncPosition);
    editor.on("blur", syncPosition);

    return () => {
      editor.off("selectionUpdate", syncPosition);
      editor.off("transaction", syncPosition);
      editor.off("focus", syncPosition);
      editor.off("blur", syncPosition);
    };
  }, [editor, disabled, syncPosition]);

  // The selection moves with the page, so follow scrolls anywhere in the tree
  // (capture catches scroll on inner containers, which does not bubble).
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

  if (!position || disabled || typeof document === "undefined") {
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
      // Keep the editor selection intact when a button is pressed: a plain
      // mousedown on the toolbar would blur the editor and collapse it.
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </div>,
    document.body
  );
}
