import {
  DocumentBlockMenu,
  useDocumentBlockMenu,
} from "@app/components/editor/document/DocumentBlockMenu";
import { DocumentSaveStatus } from "@app/components/editor/document/DocumentSaveStatus";
import { DocumentSelectionToolbar } from "@app/components/editor/document/DocumentSelectionToolbar";
import { DocumentSourcePreview } from "@app/components/editor/document/DocumentSourcePreview";
import type { DocumentProps } from "@app/components/editor/document/types";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { cn } from "@dust-tt/sparkle";
import { EditorContent } from "@tiptap/react";
import type React from "react";
import { useEffect } from "react";

export type {
  DocumentDraftState,
  DocumentProps,
  DocumentSaveResult,
} from "@app/components/editor/document/types";

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 3_000;

/**
 * @cc [owner:PopDaph,label:product] document-ui-fixed
 * Typography layout and formatting controls MUST remain fixed. Callers MUST NOT supply editor
 * instances, extensions, or toolbar configuration. Inline controls MUST require a nonempty
 * text selection. Block commands MUST require an editable document and a typed `/`.
 * className MUST apply only to the outer container.
 */
/**
 * @cc [owner:PopDaph,label:product] document-read-only
 * When readOnly is true or onSave is absent, Document MUST disable editing, formatting
 * controls, and save callbacks, including when these props change after mount. Hosts MUST
 * apply their permissions through readOnly. Losing editability MUST preserve unsaved
 * content and show that saving is unavailable, without offering a Retry action.
 */
export const Document = ({
  initialContent,
  className,
  mountPortalContainer,
  readOnly = false,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  onSave,
  onStateChange,
}: DocumentProps) => {
  const { editor, editable, unsupported, dirty, saving, error, save } =
    useDocumentEditor({
      initialContent,
      readOnly,
      autosaveDebounceMs,
      onSave,
    });
  const blockMenu = useDocumentBlockMenu(editor, editable);

  useEffect(() => {
    onStateChange?.({ dirty, saving });
  }, [dirty, saving, onStateChange]);

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

  if (unsupported !== null) {
    return (
      <DocumentSourcePreview
        source={unsupported.source}
        reason={unsupported.reason}
        className={className}
      />
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
