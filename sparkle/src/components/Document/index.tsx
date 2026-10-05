"use client";

import { Button } from "@sparkle/components/Button";
import { MessageTextCircle01 } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { EditorContent } from "@tiptap/react";
import React, { useId, useRef } from "react";
import { DocumentBlockMenu, useDocumentBlockMenu } from "./DocumentBlockMenu";
import { DocumentCommentComposer } from "./DocumentCommentComposer";
import { DocumentCommentMarkers } from "./DocumentCommentMarkers";
import { DocumentCommentsPanel } from "./DocumentCommentsPanel";
import { DocumentSaveStatus } from "./DocumentSaveStatus";
import { DocumentSelectionToolbar } from "./DocumentSelectionToolbar";
import { DocumentSourcePreview } from "./DocumentSourcePreview";
import { DocumentVisualsContext } from "./DocumentVisual";
import type { DocumentProps } from "./types";
import { useDocumentComments } from "./useDocumentComments";
import { useDocumentEditor } from "./useDocumentEditor";

export type {
  DocumentComment,
  DocumentCommentAuthor,
  DocumentCommentReply,
  DocumentProps,
  DocumentSaveOutcome,
  DocumentSaveResult,
} from "./types";

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
/**
 * @cc [owner:flvndvd,label:product] document-comments-availability
 * Commenting MUST require an editable document, JSON saveFormat and commentAuthor. Existing
 * comments MUST remain visible and browsable, through highlights, markers and the panel, in
 * read-only documents and without an author. Clicking a highlight MUST reveal its comment.
 * Overlapping comments MUST reveal the one covering the least text first, then cycle
 * outward on repeated clicks.
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
  visuals,
  commentAuthor,
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
  const comments = useDocumentComments({
    editor,
    canComment: editable && saveFormat === "json",
    author: commentAuthor,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const showCommentsToggle = comments.comments.length > 0 || comments.canWrite;

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

    if (
      (event.metaKey || event.ctrlKey) &&
      event.altKey &&
      !event.shiftKey &&
      event.code === "KeyM"
    ) {
      if (comments.startDraft()) {
        event.preventDefault();
      }
      return;
    }

    blockMenu.onKeyDown(event);
  };

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editor) {
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

  const unresolvedCount = comments.unresolved.length;
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
          {editable || dirty || saving ? (
            <DocumentSaveStatus
              dirty={dirty}
              saving={saving}
              error={saveError}
              onRetry={editable ? save : undefined}
              autosaveDebounceMs={autosaveDebounceMs}
            >
              {commentsToggle}
            </DocumentSaveStatus>
          ) : (
            showCommentsToggle && (
              <div className="mb-6 flex min-h-6 items-center justify-end print:hidden">
                {commentsToggle}
              </div>
            )
          )}
          {editor && editable && (
            <>
              <DocumentSelectionToolbar
                editor={editor}
                mountPortalContainer={mountPortalContainer}
                onComment={comments.canWrite ? comments.startDraft : undefined}
              />
              <DocumentBlockMenu editor={editor} menu={blockMenu} />
            </>
          )}
          <DocumentVisualsContext.Provider value={visuals}>
            <div onClick={handleEditorClick}>
              <EditorContent editor={editor} />
            </div>
          </DocumentVisualsContext.Provider>
          {editor && unresolvedCount > 0 && (
            <DocumentCommentMarkers
              editor={editor}
              comments={comments}
              containerRef={contentRef}
              mountPortalContainer={mountPortalContainer}
            />
          )}
          {editor && commentAuthor && comments.draft && (
            <DocumentCommentComposer
              // A new range is a new draft: reset the typed text and position.
              key={`${comments.draft.from}:${comments.draft.to}`}
              editor={editor}
              author={commentAuthor}
              comments={comments}
              containerRef={contentRef}
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
