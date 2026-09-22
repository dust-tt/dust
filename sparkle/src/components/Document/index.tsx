"use client";

import { cn } from "@sparkle/lib/utils";
import { EditorContent } from "@tiptap/react";
import React from "react";
import { DocumentBlockMenu, useDocumentBlockMenu } from "./DocumentBlockMenu";
import { DocumentSaveStatus } from "./DocumentSaveStatus";
import { DocumentSelectionToolbar } from "./DocumentSelectionToolbar";
import { DocumentSourcePreview } from "./DocumentSourcePreview";
import type { DocumentProps } from "./types";
import { useDocumentEditor } from "./useDocumentEditor";

export type { DocumentProps, DocumentSaveResult } from "./types";

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 3_000;

/**
 * @cc [owner:flvndvd,label:product] document-ui-owned-by-sparkle
 * Typography and formatting controls MUST remain fixed. Callers MUST NOT supply editor
 * instances, extensions, or toolbar configuration. Inline controls MUST require a nonempty
 * text selection. Block commands MUST require an editable document and a typed `/`.
 * className MUST apply only to the outer container.
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
  saveFormat = "json",
  className,
  readOnly = false,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  onSave,
  onPendingChangesChange,
}: DocumentProps) => {
  const {
    editor,
    editable,
    valid,
    validationError,
    unsupportedMarkdown,
    dirty,
    saving,
    error,
    inputError,
    save,
  } = useDocumentEditor({
    initialContent,
    contentType,
    saveFormat,
    readOnly,
    autosaveDebounceMs,
    onSave,
    onPendingChangesChange,
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

  if (unsupportedMarkdown !== null) {
    return (
      <DocumentSourcePreview
        source={unsupportedMarkdown}
        className={className}
        reason={validationError ?? undefined}
      />
    );
  }

  if (!valid) {
    return (
      <article className={className}>
        <p role="alert">
          {validationError} Its saved content has not been changed.
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
        {inputError && (
          <p
            role="alert"
            className="mb-6 rounded-lg border border-border bg-muted-background px-4 py-3 text-foreground copy-sm"
          >
            That change was not applied. {inputError}
          </p>
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
