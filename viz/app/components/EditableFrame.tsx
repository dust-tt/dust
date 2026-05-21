"use client";

import { useVizContext } from "@viz/app/components/VizContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@viz/components/ui/tooltip";
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

const FLASH_DURATION_MS = 800;

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
  const lastHoverPosRef = useRef<HoverState | null>(null);
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
      const pos = { top: rect.top, left: rect.left + rect.width / 2 };
      lastHoverPosRef.current = pos;
      setHoverState(pos);
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

      const originalVisibleText = target.dataset.originalText ?? "";
      const newVisibleText = target.textContent ?? "";

      target.contentEditable = "inherit";
      target.classList.remove(...ACTIVE_CLS);
      delete target.dataset.originalText;

      if (
        newVisibleText === originalVisibleText ||
        isSavingRef.current ||
        !editText
      ) {
        return;
      }

      const flash = (cls: string[]) => {
        target.classList.add(...cls);
        setTimeout(() => target.classList.remove(...cls), FLASH_DURATION_MS);
      };

      // Wrap rawText with surrounding source context so the server string-search is unique.
      const rawText = decodeURIComponent(target.dataset.rawText ?? "");
      const ctxBefore = decodeURIComponent(target.dataset.ctxBefore ?? "");
      const ctxAfter = decodeURIComponent(target.dataset.ctxAfter ?? "");
      // rawText may start/end with \n+indent (multi-line JSX) that the browser strips from
      // textContent. Re-attach only that newline-based whitespace so the file replacement matches
      // the exact source bytes. Inline spaces are already present in textContent, so we skip them.
      const leadingWs = rawText.match(/^\s*\n\s*/)?.[0] ?? "";
      const trailingWs = rawText.match(/\s*\n\s*$/)?.[0] ?? "";
      const newRawText = leadingWs + newVisibleText + trailingWs;
      const oldText = ctxBefore + rawText + ctxAfter;
      const newText = ctxBefore + newRawText + ctxAfter;

      isSavingRef.current = true;
      void editText({ oldText, newText })
        .then((result) => {
          if (!result.success) {
            target.textContent = originalVisibleText;
            flash(FAILED_CLS);
          } else {
            // Keep data-raw-text in sync so chained edits on the same span stay correct.
            target.dataset.rawText = encodeURIComponent(newRawText);
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

  const anchorPos = hoverState ?? lastHoverPosRef.current;

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
      <Tooltip open={!!hoverState}>
        <TooltipTrigger asChild>
          <span
            style={anchorPos ? { top: anchorPos.top, left: anchorPos.left } : undefined}
            className="pointer-events-none fixed size-px"
          />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          Double-click to edit
        </TooltipContent>
      </Tooltip>
    </>
  );
}
