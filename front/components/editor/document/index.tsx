import {
  DocumentBlockMenu,
  useDocumentBlockMenu,
} from "@app/components/editor/document/DocumentBlockMenu";
import { DocumentSaveStatus } from "@app/components/editor/document/DocumentSaveStatus";
import { DocumentSelectionToolbar } from "@app/components/editor/document/DocumentSelectionToolbar";
import { DocumentSourcePreview } from "@app/components/editor/document/DocumentSourcePreview";
import type { DocumentProps } from "@app/components/editor/document/types";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { EditorContent } from "@app/components/editor/EditorContent";
import { cn } from "@dust-tt/sparkle";
import type React from "react";

export type {
  DocumentProps,
  DocumentSaveResult,
} from "@app/components/editor/document/types";

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 3_000;

/**
 * @cc [owner:flvndvd,label:product] document-ui-owned-by-sparkle
 * Typography layout and formatting controls MUST remain fixed. Hosts MAY theme content fonts
 * and colors through CSS, without restyling editing controls. Callers MUST NOT supply editor
 * instances, extensions, or toolbar configuration. Inline controls MUST require a nonempty
 * text selection. Block commands MUST require an editable document and a typed `/`.
 * className MUST apply only to the outer container.
 */
/**
 * @cc [owner:flvndvd,label:product] document-content-style-boundary
 * The .tiptap subtree MUST contain document content. Editing controls and save status MUST
 * remain outside that subtree so hosts can theme content without restyling the controls.
 */
/**
 * @cc [owner:flvndvd,label:product] document-read-only
 * When readOnly is true or onSave is absent, Document MUST disable editing, formatting
 * controls, and save callbacks, including when these props change after mount. Hosts MUST
 * apply their permissions through readOnly. Losing editability MUST preserve unsaved
 * content and show that saving is unavailable, without offering a Retry action.
 */
export const Document = ({
  initialContent,
  contentType = "markdown",
  saveFormat = "json",
  className,
  mountPortalContainer,
  readOnly = false,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  onSave,
}: DocumentProps) => {
  const {
    editor,
    editable,
    valid,
    unsupportedMarkdown,
    dirty,
    saving,
    error,
    save,
  } = useDocumentEditor({
    initialContent,
    contentType,
    saveFormat,
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

  if (unsupportedMarkdown !== null) {
    return (
      <DocumentSourcePreview
        source={unsupportedMarkdown}
        className={className}
      />
    );
  }

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

  const saveError =
    !editable && dirty && !saving
      ? "Saving is unavailable. Your unsaved changes are still here. Copy them before reopening."
      : error;

  return (
    <article
      className={cn("@container relative", className)}
      onKeyDownCapture={handleKeyDown}
    >
      <div
        className={cn(
          "relative mx-auto max-w-[50rem] px-5 pb-16 font-sans text-foreground antialiased @sm:px-12 print:max-w-none print:p-0",
          editable ? "pt-5 @sm:pt-8" : "pt-8 @sm:pt-18"
        )}
      >
        {(editable || dirty || saving) && (
          <DocumentSaveStatus
            dirty={dirty}
            saving={saving}
            error={saveError}
            onRetry={editable ? save : undefined}
            autosaveDebounceMs={autosaveDebounceMs}
          />
        )}
        {editor && editable && (
          <>
            <DocumentSelectionToolbar
              editor={editor}
              mountPortalContainer={mountPortalContainer}
            />
            <DocumentBlockMenu editor={editor} menu={blockMenu} />
          </>
        )}
        <EditorContent editor={editor} />
      </div>
    </article>
  );
};
