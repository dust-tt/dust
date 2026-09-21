"use client";

import { cn } from "@sparkle/lib/utils";
import { EditorContent } from "@tiptap/react";
import React from "react";
import { DocumentBlockMenu, useDocumentBlockMenu } from "./DocumentBlockMenu";
import { DocumentSaveStatus } from "./DocumentSaveStatus";
import { DocumentSelectionToolbar } from "./DocumentSelectionToolbar";
import type { DocumentProps } from "./types";
import { useDocumentEditor } from "./useDocumentEditor";

export type { DocumentProps, DocumentSaveResult } from "./types";

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 3_000;

/**
 * @cc [owner:flvndvd,label:product] document-ui-owned-by-sparkle
 * Document MUST own its typography and formatting controls. Inline controls MUST appear only
 * for a nonempty text selection; block commands MUST appear only after typing `/` in an
 * editable document. Callers supply content and a persistence callback, not an editor
 * instance, extensions, or toolbar configuration. className MUST apply to the outer container;
 * the inner reading surface and formatting controls remain owned by Document.
 */
/**
 * @cc [owner:flvndvd,label:product] document-read-only
 * When readOnly is true or onSave is absent, Document MUST disable editing, formatting
 * controls, and save callbacks, including when these props change after mount. Hosts MUST
 * apply their permissions through readOnly.
 */
export const Document = ({
  initialContent,
  contentType = "markdown",
  className,
  readOnly = false,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  onSave,
}: DocumentProps) => {
  const { editor, editable, valid, dirty, saving, error, save } =
    useDocumentEditor({
      initialContent,
      contentType,
      readOnly,
      autosaveDebounceMs,
      onSave,
    });
  const blockMenu = useDocumentBlockMenu(editor, editable);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      event.nativeEvent.isComposing ||
      !(event.target instanceof Node) ||
      !editor?.view.dom.contains(event.target)
    ) {
      return;
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault();
      void save();
      return;
    }

    blockMenu.onKeyDown(event);
  };

  if (!valid) {
    return (
      <article className={className}>
        <p role="alert">
          This document could not be opened. Its saved content has not been
          changed.
        </p>
      </article>
    );
  }

  return (
    <article
      className={cn("@container", className)}
      onKeyDownCapture={handleKeyDown}
    >
      <div
        className={cn(
          "mx-auto max-w-[50rem] px-5 pb-16 font-sans text-foreground antialiased @sm:px-12 print:max-w-none print:p-0",
          editable ? "pt-5 @sm:pt-8" : "pt-8 @sm:pt-18"
        )}
      >
        {editable && (
          <DocumentSaveStatus
            dirty={dirty}
            saving={saving}
            error={error}
            onRetry={save}
            autosaveDebounceMs={autosaveDebounceMs}
          />
        )}
        {editor && editable && (
          <>
            <DocumentSelectionToolbar editor={editor} />
            <DocumentBlockMenu editor={editor} menu={blockMenu} />
          </>
        )}
        <EditorContent editor={editor} />
      </div>
    </article>
  );
};
