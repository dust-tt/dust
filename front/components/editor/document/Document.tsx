import {
  DocumentBlockMenu,
  useDocumentBlockMenu,
} from "@app/components/editor/document/DocumentBlockMenu";
import { DocumentCommentMarkers } from "@app/components/editor/document/DocumentCommentMarkers";
import { DocumentCommentsPanel } from "@app/components/editor/document/DocumentCommentsPanel";
import {
  DocumentSaveError,
  DocumentSaveStatus,
  StatusRow,
} from "@app/components/editor/document/DocumentSaveStatus";
import { DocumentSelectionToolbar } from "@app/components/editor/document/DocumentSelectionToolbar";
import { DocumentSourcePreview } from "@app/components/editor/document/DocumentSourcePreview";
import type { DocumentProps } from "@app/components/editor/document/types";
import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { EditorContent } from "@app/components/editor/EditorContent";
import { Button, cn, MessageTextCircle01 } from "@dust-tt/sparkle";
import type React from "react";
import { useId, useRef } from "react";

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 3_000;

/** Comment ids of every highlight wrapping the clicked element. */
const getClickedCommentIds = (target: EventTarget | null, root: Element) => {
  const ids: string[] = [];
  let element = target instanceof Element ? target : null;

  while (element && element !== root) {
    const id = element.getAttribute("data-comment-highlight");
    if (id !== null) {
      ids.push(id);
    }
    element = element.parentElement;
  }

  return ids;
};

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
/**
 * @cc [owner:flvndvd;tdraier,label:product] document-comments-availability
 * Existing comments MUST remain visible and browsable, through highlights, markers and the
 * panel, whether the document is editable or read-only. Clicking a highlight without selecting
 * text MUST reveal its comment; a click that ends a text selection MUST NOT, so the selection
 * keeps the editor's focus and its controls. Overlapping comments MUST reveal the one covering
 * the least text first, then cycle outward on repeated clicks.
 */
export const Document = ({
  initialContent,
  className,
  mountPortalContainer,
  readOnly = false,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  onSave,
  onStateChange,
  badge,
}: DocumentProps) => {
  const { editor, editable, unsupported, dirty, saving, error, save } =
    useDocumentEditor({
      initialContent,
      readOnly,
      autosaveDebounceMs,
      onSave,
      onStateChange,
    });
  const blockMenu = useDocumentBlockMenu(editor, editable);
  const comments = useDocumentComments({ editor });
  const contentRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const showCommentsToggle = comments.comments.length > 0;

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

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // A drag or double click on commented text selects it; revealing would steal its focus.
    if (!editor || !editor.state.selection.empty) {
      return;
    }

    const clicked = getClickedCommentIds(event.target, editor.view.dom);
    if (clicked.length === 0) {
      if (comments.activeId !== null) {
        comments.select(null);
      }
      return;
    }

    // Start with the most specific comment, then widen on repeated clicks.
    const ids = clicked.sort(
      (a, b) =>
        (comments.quotes.get(a)?.length ?? 0) -
        (comments.quotes.get(b)?.length ?? 0)
    );
    const current = comments.activeId ? ids.indexOf(comments.activeId) : -1;
    comments.reveal(ids[(current + 1) % ids.length]);
  };

  if (unsupported !== null) {
    return (
      <div className={className}>
        {badge && (
          <div className="mx-auto max-w-[50rem] px-5 pt-8">
            <StatusRow badge={badge} />
          </div>
        )}
        <DocumentSourcePreview
          source={unsupported.source}
          reason={unsupported.reason}
        />
      </div>
    );
  }

  const unresolvedCount = comments.unresolved.length;
  const showSaveStatus = editable || dirty || saving;
  const saveError =
    !editable && dirty && !saving
      ? "Saving is unavailable. Your unsaved changes are still here. Copy them before reopening."
      : error;
  const commentsToggle = showCommentsToggle && (
    <Button
      ref={comments.toggleRef}
      type="button"
      variant="ghost"
      size="xs"
      icon={MessageTextCircle01}
      label="Comments"
      aria-label={
        unresolvedCount > 0
          ? `Comments, ${unresolvedCount} unresolved`
          : "Comments"
      }
      isCounter={unresolvedCount > 0}
      counterValue={String(unresolvedCount)}
      aria-expanded={comments.panelOpen}
      aria-controls={panelId}
      onClick={comments.togglePanel}
    />
  );

  return (
    <article
      className={cn("@container relative", className)}
      onKeyDownCapture={handleKeyDown}
    >
      {/* Container queries resolve against the article, so the push padding lives one level down. */}
      <div
        className={cn(
          "transition-[padding] duration-300 ease-out-quint motion-reduce:transition-none",
          comments.panelOpen && "@6xl:pr-80"
        )}
      >
        <div
          ref={contentRef}
          className={cn(
            "relative mx-auto max-w-[50rem] px-5 pb-16 font-sans text-foreground antialiased @sm:px-12 print:max-w-none print:p-0",
            editable || showCommentsToggle ? "pt-5 @sm:pt-8" : "pt-8 @sm:pt-18"
          )}
        >
          {(showSaveStatus || badge || showCommentsToggle) && (
            <StatusRow badge={badge}>
              {showSaveStatus && (
                <DocumentSaveStatus
                  dirty={dirty}
                  saving={saving}
                  error={saveError}
                  onRetry={editable ? save : undefined}
                  autosaveDebounceMs={autosaveDebounceMs}
                />
              )}
              {commentsToggle}
            </StatusRow>
          )}
          {showSaveStatus && saveError && (
            <DocumentSaveError error={saveError} />
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
          <div onClick={handleEditorClick}>
            <EditorContent editor={editor} />
          </div>
          {editor && unresolvedCount > 0 && (
            <DocumentCommentMarkers
              editor={editor}
              comments={comments}
              containerRef={contentRef}
              mountPortalContainer={mountPortalContainer}
            />
          )}
        </div>
      </div>
      {editor && showCommentsToggle && (
        <DocumentCommentsPanel
          id={panelId}
          comments={comments}
          mountPortalContainer={mountPortalContainer}
        />
      )}
    </article>
  );
};
