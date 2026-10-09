import {
  DocumentBlockMenu,
  useDocumentBlockMenu,
} from "@app/components/editor/document/DocumentBlockMenu";
import { DocumentCommentMarkers } from "@app/components/editor/document/DocumentCommentMarkers";
import {
  DocumentCommentsPanel,
  DocumentCommentsToggle,
} from "@app/components/editor/document/DocumentCommentsPanel";
import {
  DocumentLiveStatus,
  DocumentStatus,
} from "@app/components/editor/document/DocumentSaveStatus";
import { DocumentSelectionToolbar } from "@app/components/editor/document/DocumentSelectionToolbar";
import { DocumentSourcePreview } from "@app/components/editor/document/DocumentSourcePreview";
import type {
  DocumentProps,
  LiveStatus,
} from "@app/components/editor/document/types";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { EditorContent } from "@app/components/editor/EditorContent";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import { cn } from "@dust-tt/sparkle";
import type { AnyExtension, Editor } from "@tiptap/core";
import type React from "react";
import { lazy, Suspense, useId, useRef } from "react";

// Loaded only for a live document, so other editors never download Yjs and its provider.
const LiveDocument = lazy(
  () => import("@app/components/editor/document/LiveDocument")
);

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 3_000;

/**
 * @cc [owner:PopDaph,label:product] document-ui-fixed
 * Typography layout and formatting controls MUST remain fixed. Callers MUST NOT supply the
 * document editor's instance, extensions, or toolbar configuration; `commentInputExtensions`
 * MUST reach only the comment and reply fields' editors. Inline controls MUST require a nonempty
 * text selection. Block commands MUST require an editable document, and either a typed `/` or the
 * selection toolbar's text style and list menus.
 * className MUST apply only to the outer container.
 */
/**
 * @cc [owner:PopDaph,label:product] document-read-only
 * When readOnly is true, or neither onSave nor live is given, Document MUST disable editing,
 * formatting controls, and save callbacks, including when these props change after mount.
 * Hosts MUST apply their permissions through readOnly. Losing editability MUST preserve unsaved
 * content and show that saving is unavailable, without offering a Retry action.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:product] document-comments-availability
 * Commenting MUST require an editable document and commentAuthor. Existing comments MUST
 * remain visible and browsable, through highlights, markers and the panel, in read-only
 * documents and without an author. Clicking a highlight without selecting text MUST reveal its
 * comment; a click that ends a text selection MUST NOT, so the selection keeps the editor's
 * focus and its controls. Overlapping comments MUST reveal the one covering the least text
 * first, then cycle outward on repeated clicks.
 */
export const Document = (props: DocumentProps) =>
  props.live ? (
    <Suspense
      fallback={
        <DocumentView
          {...props}
          liveView={{ status: "connecting", binding: null }}
        />
      }
    >
      <LiveDocument {...props} live={props.live} />
    </Suspense>
  ) : (
    <DocumentView {...props} />
  );

interface DocumentViewProps extends DocumentProps {
  liveView?: {
    status: LiveStatus;
    /** Bound to the shared document once synced; until then the file shows read-only. */
    binding: {
      extensions: AnyExtension[];
      connected: boolean;
      comments: LiveCommentChannel;
    } | null;
  };
}

interface DocumentShortcutTargets {
  editor: Editor | null;
  save: () => Promise<void>;
  /** Returns whether a comment draft started. */
  startDraft: () => boolean;
  onBlockMenuKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

/** Cmd/Ctrl+S saves and Cmd/Ctrl+Alt+M starts a comment; other keys go to the block menu. */
const handleDocumentShortcut = (
  event: React.KeyboardEvent<HTMLElement>,
  { editor, save, startDraft, onBlockMenuKeyDown }: DocumentShortcutTargets
) => {
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
    if (startDraft()) {
      event.preventDefault();
    }
    return;
  }

  onBlockMenuKeyDown(event);
};

/** The editor's binding to the shared document, and whether it still waits for one. */
const liveEditorMode = (liveView: DocumentViewProps["liveView"]) => ({
  binding: liveView?.binding ?? undefined,
  waiting: liveView?.binding === null,
});

interface DocumentEditingControlsProps {
  editor: Editor | null;
  comments: DocumentCommentsController;
  blockMenu: ReturnType<typeof useDocumentBlockMenu>;
}

/** The formatting toolbar over a selection and the `/` block menu, while editable. */
const DocumentEditingControls = ({
  editor,
  comments,
  blockMenu,
}: DocumentEditingControlsProps) =>
  editor && (
    <>
      <DocumentSelectionToolbar
        editor={editor}
        onComment={comments.canWrite ? comments.startDraft : undefined}
      />
      <DocumentBlockMenu editor={editor} menu={blockMenu} />
    </>
  );

/** The editor itself; `Document` picks the live or the file-saving mode around it. */
export const DocumentView = ({
  initialContent,
  className,
  mountPortalContainer,
  readOnly = false,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  onSave,
  onStateChange,
  liveView,
  commentAuthor,
  renderCommentAuthorAvatar,
  signCommentMessage,
  verifyCommentMessage,
  renderCommentBody,
  commentInputExtensions,
}: DocumentViewProps) => {
  const live = liveEditorMode(liveView);
  const {
    editor,
    editable,
    unsupported,
    dirty,
    saving,
    error,
    save,
    isSavable,
  } = useDocumentEditor({
    initialContent,
    readOnly: readOnly || live.waiting,
    autosaveDebounceMs,
    onSave,
    onStateChange,
    live: live.binding,
  });
  // Live documents are edited through the session: no file saves.
  const canEditFile = editable && liveView === undefined;
  const blockMenu = useDocumentBlockMenu(editor, editable);
  const comments = useDocumentComments({
    editor,
    canComment: editable,
    author: commentAuthor,
    isSavable,
    sign: signCommentMessage,
    verify: verifyCommentMessage,
    live: live.binding?.comments,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const showCommentsToggle = comments.comments.length > 0 || comments.canWrite;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) =>
    handleDocumentShortcut(event, {
      editor,
      save,
      startDraft: comments.startDraft,
      onBlockMenuKeyDown: blockMenu.onKeyDown,
    });

  if (unsupported !== null) {
    return (
      <DocumentSourcePreview
        className={className}
        source={unsupported.source}
        reason={unsupported.reason}
      />
    );
  }

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
          <DocumentStatus
            editable={canEditFile}
            dirty={dirty}
            saving={saving}
            error={error}
            autosaveDebounceMs={autosaveDebounceMs}
            onRetry={save}
          >
            {liveView && <DocumentLiveStatus status={liveView.status} />}
            {showCommentsToggle && (
              <DocumentCommentsToggle panelId={panelId} comments={comments} />
            )}
          </DocumentStatus>
          {editable && (
            <DocumentEditingControls
              editor={editor}
              comments={comments}
              blockMenu={blockMenu}
            />
          )}
          {/* Only catches clicks bubbling from highlights; keyboard users reach comments through
              the markers and the panel. */}
          <div
            role="presentation"
            onClick={(event) => comments.revealClicked(event.target)}
          >
            <EditorContent editor={editor} />
          </div>
          {editor && comments.unresolved.length > 0 && (
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
          renderCommentBody={renderCommentBody}
          commentInputExtensions={commentInputExtensions}
          mountPortalContainer={mountPortalContainer}
          renderAuthorAvatar={renderCommentAuthorAvatar}
        />
      )}
    </article>
  );
};
