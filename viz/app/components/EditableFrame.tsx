"use client";

import { useVizContext } from "@viz/app/components/VizContext";
import { EDITABLE_FILE_ID_PREFIX } from "@viz/app/lib/transformEditableText";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@viz/components/ui/tooltip";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const EDITABLE_SELECTOR = "[data-editable]";
const FORM_CONTROL_SELECTOR = "button, input, select, textarea";
const LINK_SELECTOR = "a[href]";

/** Set on controls we disabled for Edit mode (restore by clearing disabled). */
const ATTR_WE_DISABLED = "data-frame-edit-disabled";
/** Set on controls that were already disabled (leave disabled; only clear the marker). */
const ATTR_WAS_DISABLED = "data-frame-edit-was-disabled";
/** Stores the original href on anchors while Edit mode strips navigation. */
const ATTR_SAVED_HREF = "data-frame-edit-href";

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

// Keep [data-editable] clickable inside disabled buttons (browsers otherwise eat the click).
const EDIT_MODE_ROOT_CLS = "frame-edit-mode";
const EDIT_MODE_POINTER_CLS = [
  // Controls we gated: ignore hits on the chrome; children with data-editable opt back in.
  "[&_[data-frame-edit-disabled]]:pointer-events-none",
  "[&_[data-frame-edit-was-disabled]]:pointer-events-none",
  "[&_a[data-frame-edit-href]]:pointer-events-none",
  "[&_[data-editable]]:pointer-events-auto",
  "[&_[data-editable]]:cursor-text",
];

const FLASH_DURATION_MS = 800;

interface HoverState {
  left: number;
  top: number;
}

interface EditableFrameProps {
  children: ReactNode;
}

function disableInteractiveControls(root: HTMLElement) {
  root.querySelectorAll(FORM_CONTROL_SELECTOR).forEach((node) => {
    const el = node as HTMLInputElement;
    if (
      el.hasAttribute(ATTR_WE_DISABLED) ||
      el.hasAttribute(ATTR_WAS_DISABLED)
    ) {
      return;
    }
    if (el.disabled) {
      el.setAttribute(ATTR_WAS_DISABLED, "");
      return;
    }
    el.disabled = true;
    el.setAttribute(ATTR_WE_DISABLED, "");
  });

  root.querySelectorAll(LINK_SELECTOR).forEach((node) => {
    const el = node as HTMLAnchorElement;
    if (el.hasAttribute(ATTR_SAVED_HREF)) {
      return;
    }
    el.setAttribute(ATTR_SAVED_HREF, el.getAttribute("href") ?? "");
    el.removeAttribute("href");
    el.setAttribute("aria-disabled", "true");
    el.tabIndex = -1;
  });
}

function restoreInteractiveControls(root: HTMLElement) {
  root.querySelectorAll(`[${ATTR_WE_DISABLED}]`).forEach((node) => {
    const el = node as HTMLInputElement;
    el.disabled = false;
    el.removeAttribute(ATTR_WE_DISABLED);
  });
  root.querySelectorAll(`[${ATTR_WAS_DISABLED}]`).forEach((node) => {
    node.removeAttribute(ATTR_WAS_DISABLED);
  });
  root.querySelectorAll(`a[${ATTR_SAVED_HREF}]`).forEach((node) => {
    const el = node as HTMLAnchorElement;
    const href = el.getAttribute(ATTR_SAVED_HREF);
    el.removeAttribute(ATTR_SAVED_HREF);
    if (href !== null) {
      el.setAttribute("href", href);
    }
    el.removeAttribute("aria-disabled");
    el.removeAttribute("tabindex");
  });
}

export function EditableFrame({ children }: EditableFrameProps) {
  const { editText, addEventListener, stagedEdits, editModeActive } =
    useVizContext();
  const rootRef = useRef<HTMLDivElement>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const lastHoverPosRef = useRef<HoverState | null>(null);
  const hoveredSpanRef = useRef<HTMLElement | null>(null);
  // Legacy (immediate publish): drop overlapping blurs like main. Staged v2: allow concurrent
  // commits so FLUSH_EDITABLES can wait on in-flight stages.
  const isSavingRef = useRef(false);
  const commitInFlightRef = useRef<Promise<void> | null>(null);
  // v2 Preview: EditableFrame stays mounted (no remount) but interactions are off.
  const interactionsEnabled = !stagedEdits || editModeActive;

  const clearHover = useCallback(() => {
    if (hoveredSpanRef.current) {
      hoveredSpanRef.current.classList.remove(...HOVER_CLS);
      hoveredSpanRef.current = null;
    }
    setHoverState(null);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!interactionsEnabled) {
        clearHover();
        return;
      }

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
    },
    [clearHover, interactionsEnabled]
  );

  const handleMouseLeave = useCallback(() => {
    clearHover();
  }, [clearHover]);

  const beginEditing = useCallback((target: HTMLElement) => {
    if (target.contentEditable === "true") {
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

  // Legacy: double-click (main). v2 staged Edit session: single click — Preview|Edit already
  // opted in, so requiring a second click feels quirky.
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!interactionsEnabled || stagedEdits) {
        return;
      }
      const target = (e.target as Element).closest<HTMLElement>(
        EDITABLE_SELECTOR
      );
      if (!target) {
        return;
      }
      beginEditing(target);
    },
    [beginEditing, interactionsEnabled, stagedEdits]
  );

  const handleClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!interactionsEnabled || !stagedEdits) {
        return;
      }
      const target = (e.target as Element).closest<HTMLElement>(
        EDITABLE_SELECTOR
      );
      if (!target || target.contentEditable === "true") {
        return;
      }
      // Capture before button bubble handlers; disabled alone is not enough because React
      // can still fire onClick when the event originates on a pointer-events:auto child.
      e.preventDefault();
      e.stopPropagation();
      beginEditing(target);
    },
    [beginEditing, interactionsEnabled, stagedEdits]
  );

  // Edit mode: disable form controls (tracking prior disabled) and disarm links so Preview
  // behavior returns cleanly. pointer-events CSS keeps [data-editable] clickable inside.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !stagedEdits || !editModeActive) {
      return;
    }

    disableInteractiveControls(root);
    const observer = new MutationObserver(() => {
      disableInteractiveControls(root);
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      restoreInteractiveControls(root);
    };
  }, [editModeActive, stagedEdits]);

  const commitEditable = useCallback(
    async (target: HTMLElement) => {
      if (target.contentEditable !== "true") {
        return;
      }

      const originalVisibleText = target.dataset.originalText ?? "";
      const newVisibleText = target.textContent ?? "";

      target.contentEditable = "inherit";
      target.classList.remove(...ACTIVE_CLS);
      delete target.dataset.originalText;

      if (newVisibleText === originalVisibleText || !editText) {
        return;
      }

      if (!stagedEdits && isSavingRef.current) {
        return;
      }

      const flash = (cls: string[]) => {
        target.classList.add(...cls);
        setTimeout(() => target.classList.remove(...cls), FLASH_DURATION_MS);
      };

      // Published (bundled) frames carry a `data-source` ("<relPath>:<line>:<col>") on each JSX
      // element. When present, route the edit to the source file by location (robust against
      // duplicated text and works through the bundle). Otherwise, fall back to the legacy
      // context-string match against the rendered code.
      const sourceEl = target.closest<HTMLElement>("[data-source]");
      const source = sourceEl?.dataset.source;

      const rawText = decodeURIComponent(target.dataset.rawText ?? "");
      const rawFileId = target.dataset.fileId;
      const targetFileId = rawFileId?.startsWith(EDITABLE_FILE_ID_PREFIX)
        ? rawFileId.slice(EDITABLE_FILE_ID_PREFIX.length)
        : undefined;

      // rawText may start/end with \n+indent (multi-line JSX) that the browser strips from
      // textContent. Re-attach only that newline-based whitespace so the file replacement matches
      // the exact source bytes. Inline spaces are already present in textContent, so we skip them.
      const leadingWs = rawText.match(/^\s*\n\s*/)?.[0] ?? "";
      const trailingWs = rawText.match(/\s*\n\s*$/)?.[0] ?? "";
      const newRawText = leadingWs + newVisibleText + trailingWs;

      // Location edits send the visible (trimmed) text. The server preserves surrounding
      // whitespace and disambiguates among the element's own text children by oldText.
      const editParams = source
        ? { oldText: originalVisibleText, newText: newVisibleText, source }
        : (() => {
            const ctxBefore = decodeURIComponent(
              target.dataset.ctxBefore ?? ""
            );
            const ctxAfter = decodeURIComponent(target.dataset.ctxAfter ?? "");
            return {
              oldText: ctxBefore + rawText + ctxAfter,
              newText: ctxBefore + newRawText + ctxAfter,
              targetFileId,
            };
          })();

      if (stagedEdits) {
        // Parent stages until Save; await so FLUSH_EDITABLES can wait for it.
        const result = await editText(editParams);
        if (!result.success) {
          target.textContent = originalVisibleText;
          flash(FAILED_CLS);
        } else {
          target.dataset.rawText = encodeURIComponent(newRawText);
        }
        return;
      }

      isSavingRef.current = true;
      void editText(editParams)
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
    [editText, stagedEdits]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const target = (e.target as Element).closest<HTMLElement>(
        EDITABLE_SELECTOR
      );

      if (!target) {
        return;
      }

      if (stagedEdits) {
        const commit = commitEditable(target);
        commitInFlightRef.current = commit.finally(() => {
          if (commitInFlightRef.current === commit) {
            commitInFlightRef.current = null;
          }
        });
        return;
      }

      void commitEditable(target);
    },
    [commitEditable, stagedEdits]
  );

  useEffect(() => {
    if (!stagedEdits || !addEventListener) {
      return;
    }

    // Route through VisualizationWrapper's origin-checked listener (allowed-visualization-origins).
    return addEventListener("FLUSH_EDITABLES", () => {
      void (async () => {
        const active = document.querySelector<HTMLElement>(
          `${EDITABLE_SELECTOR}[contenteditable="true"]`
        );
        if (active) {
          // Blur triggers handleBlur; also commit directly in case blur is a no-op.
          active.blur();
          await commitEditable(active);
        }
        if (commitInFlightRef.current) {
          await commitInFlightRef.current;
        }
        window.parent.postMessage({ type: "FLUSH_EDITABLES_DONE" }, "*");
      })();
    });
  }, [addEventListener, commitEditable, stagedEdits]);

  // Leaving Edit without remount: drop hover + abort any in-progress contentEditable.
  useEffect(() => {
    if (interactionsEnabled) {
      return;
    }
    clearHover();
    const active = document.querySelector<HTMLElement>(
      `${EDITABLE_SELECTOR}[contenteditable="true"]`
    );
    if (active) {
      active.textContent = active.dataset.originalText ?? active.textContent;
      active.contentEditable = "inherit";
      active.classList.remove(...ACTIVE_CLS);
      delete active.dataset.originalText;
    }
  }, [clearHover, interactionsEnabled]);

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
  const editModeClassName =
    stagedEdits && editModeActive
      ? [EDIT_MODE_ROOT_CLS, ...EDIT_MODE_POINTER_CLS].join(" ")
      : undefined;

  return (
    <>
      <div
        ref={rootRef}
        className={editModeClassName}
        onClickCapture={handleClickCapture}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
      <Tooltip open={interactionsEnabled && !!hoverState}>
        <TooltipTrigger asChild>
          <span
            style={
              anchorPos
                ? { top: anchorPos.top, left: anchorPos.left }
                : undefined
            }
            className="pointer-events-none fixed size-px"
          />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {stagedEdits ? "Click to edit" : "Double-click to edit"}
        </TooltipContent>
      </Tooltip>
    </>
  );
}
