import { cn } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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

export function EditorSelectionToolbar({
  editor,
  children,
  disabled = false,
}: EditorSelectionToolbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<Position | null>(null);

  // The toolbar follows the selection through scrolling, so its coordinates go
  // straight to the node as a transform. Rendering them as top/left would
  // re-run layout on every scroll frame, and holding them in state would
  // re-render the toolbar just as often.
  const writePosition = useCallback(() => {
    const host = hostRef.current;
    const position = positionRef.current;
    if (host && position) {
      host.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
    }
  }, []);

  const syncPosition = useCallback(() => {
    const position =
      editor && !editor.isDestroyed ? readSelectionPosition(editor) : null;
    positionRef.current = position;
    // Same boolean on every scroll frame that keeps a selection, so React bails
    // out of the re-render.
    setIsVisible(position !== null);
    writePosition();
  }, [editor, writePosition]);

  // Placing the toolbar from the ref callback puts it at the right coordinates
  // in the same commit that mounts it, so it never paints at the origin first.
  const attachHost = useCallback(
    (node: HTMLDivElement | null) => {
      hostRef.current = node;
      writePosition();
    },
    [writePosition]
  );

  useEffect(() => {
    if (!editor || disabled) {
      setIsVisible(false);
      return;
    }

    syncPosition();

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
    if (!isVisible) {
      return;
    }

    let frame = 0;
    // Coalesce scroll and resize bursts into one measurement per frame.
    const schedulePosition = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          syncPosition();
        });
      }
    };

    window.addEventListener("scroll", schedulePosition, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedulePosition);

    return () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", schedulePosition, true);
      window.removeEventListener("resize", schedulePosition);
    };
  }, [isVisible, syncPosition]);

  useEffect(() => {
    if (!isVisible) {
      setHasEntered(false);
      return;
    }

    const frame = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return createPortal(
    <div
      ref={attachHost}
      className="fixed top-0 left-0"
      style={{ zIndex: TOOLBAR_Z_INDEX }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        className={cn(
          "-translate-x-1/2 -translate-y-full",
          "origin-bottom transition-[opacity,scale] duration-100 ease-out-quart",
          "motion-reduce:transition-none",
          hasEntered ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
