"use client";

import { useVizContext } from "@viz/app/components/VizContext";
import { cn } from "@viz/lib/utils";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

const EDITABLE_SELECTOR = "[data-editable]";

// Module-level so Tailwind's content scanner includes these classes in the build.
const HOVER_CLS = [
  "outline-1",
  "outline-blue-400/50",
  "outline-dashed",
  "outline-offset-2",
];

const ACTIVE_CLS = [
  "bg-blue-500/5",
  "outline-1",
  "outline-blue-500/70",
  "outline-offset-2",
  "outline",
];

const FAILED_CLS = [
  "outline-1",
  "outline-dashed",
  "outline-offset-2",
  "outline-red-500/70",
];

interface HoverState {
  left: number;
  top: number;
}

interface EditableFrameProps {
  children: ReactNode;
}

export function EditableFrame({ children }: EditableFrameProps) {
  const { editText } = useVizContext();
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const hoveredSpanRef = useRef<HTMLElement | null>(null);
  const isSavingRef = useRef(false);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const target = (e.target as Element).closest<HTMLElement>(
      EDITABLE_SELECTOR
    );

    if (hoveredSpanRef.current && hoveredSpanRef.current !== target) {
      hoveredSpanRef.current.classList.remove(...HOVER_CLS);
    }

    if (target && target.contentEditable !== "true") {
      if (hoveredSpanRef.current !== target) {
        target.classList.add(...HOVER_CLS);
        hoveredSpanRef.current = target;
      }
      const rect = target.getBoundingClientRect();
      setHoverState({ top: rect.top - 32, left: rect.left + rect.width / 2 });
    } else {
      hoveredSpanRef.current = null;
      setHoverState(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoveredSpanRef.current) {
      hoveredSpanRef.current.classList.remove(...HOVER_CLS);
      hoveredSpanRef.current = null;
    }
    setHoverState(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = (e.target as Element).closest<HTMLElement>(
      EDITABLE_SELECTOR
    );
    if (!target || target.contentEditable === "true") {
      return;
    }
    target.classList.remove(...HOVER_CLS);
    hoveredSpanRef.current = null;
    setHoverState(null);
    target.classList.add(...ACTIVE_CLS);
    target.dataset.originalText = target.textContent ?? "";
    target.contentEditable = "true";
    target.focus();
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const target = (e.target as Element).closest<HTMLElement>(
        EDITABLE_SELECTOR
      );
      if (!target || target.contentEditable !== "true") {
        return;
      }

      const originalText = target.dataset.originalText ?? "";
      const newText = target.textContent ?? "";

      target.contentEditable = "inherit";
      target.classList.remove(...ACTIVE_CLS);
      delete target.dataset.originalText;

      if (newText === originalText || isSavingRef.current || !editText) {
        return;
      }

      const flash = (cls: string[]) => {
        target.classList.add(...cls);
        setTimeout(() => target.classList.remove(...cls), 800);
      };

      const editId = target.dataset.editId ?? "";
      isSavingRef.current = true;
      void editText(editId, originalText, newText)
        .then((result) => {
          if (!result.success) {
            target.textContent = originalText;
            flash(FAILED_CLS);
          }
        })
        .finally(() => {
          isSavingRef.current = false;
        });
    },
    [editText]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = (e.target as Element).closest<HTMLElement>(
      EDITABLE_SELECTOR
    );

    if (!target || target.contentEditable !== "true") {
      return;
    }

    // Prevent key events from reaching frame components (e.g. slideshow navigation)
    // while a span is being edited.
    e.stopPropagation();

    if (e.key === "Enter") {
      e.preventDefault();
      target.blur();
    } else if (e.key === "Escape") {
      target.textContent = target.dataset.originalText ?? "";
      target.blur();
    }
  }, []);

  return (
    <>
      <div
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
      {hoverState && (
        <div
          style={{ top: hoverState.top, left: hoverState.left }}
          className={cn(
            "pointer-events-none fixed z-50 -translate-x-1/2 rounded bg-black/70 px-2 py-1",
            "font-sans text-xs font-normal text-white"
          )}
        >
          Double-click to edit
        </div>
      )}
    </>
  );
}
