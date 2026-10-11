import {
  DocumentBlockMenu,
  useDocumentBlockMenu,
} from "@app/components/editor/document/DocumentBlockMenu";
import { DocumentCommentCard } from "@app/components/editor/document/DocumentCommentCard";
import { DocumentCommentMarkers } from "@app/components/editor/document/DocumentCommentMarkers";
import {
  DocumentCommentsList,
  DocumentCommentsToggle,
} from "@app/components/editor/document/DocumentCommentsList";
import { DocumentMarkdownPreview } from "@app/components/editor/document/DocumentMarkdownPreview";
import {
  DocumentLiveAgent,
  DocumentLiveStatus,
  DocumentStatusIcon,
  DocumentSaveError,
  DocumentStatus,
} from "@app/components/editor/document/DocumentSaveStatus";
import { DocumentSelectionToolbar } from "@app/components/editor/document/DocumentSelectionToolbar";
import type {
  DocumentLiveParticipant,
  DocumentProps,
  LiveStatus,
} from "@app/components/editor/document/types";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { EditorContent } from "@app/components/editor/EditorContent";
import type { LiveAgentEvent } from "@app/lib/client/live_agents";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import { cn } from "@dust-tt/sparkle";
import type { AnyExtension, Editor } from "@tiptap/core";
import type React from "react";
import { lazy, Suspense, useId, useRef } from "react";
import { createPortal } from "react-dom";

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
 * remain visible and browsable, through highlights, markers, their card and the list, in read-only
 * documents the editor opens and without an author; a file it cannot open shows without its
 * threads (`document-markdown-preview`). Clicking a highlight without selecting text MUST reveal its
 * comment; a click that ends a text selection MUST NOT, so the selection keeps the editor's
 * focus and its controls. Overlapping comments MUST reveal the one covering the least text
 * first, then cycle outward on repeated clicks.
 */
/**
 * @cc [owner:tdraier,label:product] document-comments-button-placement
 * With headerControlsContainer, the comments button MUST show in it and not above the document.
 * The save and live statuses MUST show as one icon in statusContainer when given (see
 * `document-status-icon`), and above the document otherwise. Without headerControlsContainer, the
 * comments button MUST show above the document.
 */
/**
 * @cc [owner:tdraier,label:product] document-chrome-spans-article
 * The status row, the comments list and the comment markers MUST span the whole article, not the
 * document's max-width column, so that in a wide host they sit at its edges; the save error MUST
 * stay in the column, under the status row.
 */
/**
 * @cc [owner:tdraier,label:product] document-live-participants
 * While the live session is live and has participants, `renderLiveParticipants` MUST show them
 * right before the comments button, wherever that button shows; otherwise nothing MUST render
 * for them.
 */
/**
 * @cc [owner:tdraier,label:product] document-live-agent-placement
 * While the session announces an agent at work, its avatar, from `renderCommentAuthorAvatar`, and
 * its activity MUST show before the participants, wherever the comments button shows, and not
 * with the save and live statuses.
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
    /** Changes not yet confirmed by the server. */
    syncing?: boolean;
    /** What an agent is doing in the document, as the session last announced. */
    agent?: LiveAgentEvent | null;
    participants?: DocumentLiveParticipant[];
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

/**
 * @cc [owner:tdraier,label:react] document-escape
 * An Escape from the document or its controls MUST close, first found, the comments list, the
 * pending comment draft or the active thread's card, even when a host already prevented the
 * event's default, as dialogs do with every Escape. It MUST NOT when the selection toolbar or a
 * comment field used it, nor when none is open, so the host can handle it. While the list, a card,
 * the block menu or the link field is open, its element MUST carry `data-document-layer`, so hosts
 * can leave such an Escape to the document; an Escape from elsewhere stays the host's.
 */
const handleDocumentEscape = (
  event: React.KeyboardEvent<HTMLElement>,
  comments: DocumentCommentsController
) => {
  if (
    event.key !== "Escape" ||
    event.nativeEvent.isComposing ||
    (event.target instanceof Element &&
      event.target.closest("[data-document-selection]"))
  ) {
    return;
  }
  if (comments.listOpen) {
    comments.closeList();
  } else if (comments.draft) {
    comments.cancelDraft();
  } else if (comments.activeId !== null) {
    comments.closeThread();
  } else {
    return;
  }
  event.preventDefault();
};

/** Whether a document under `root` shows a layer that Escape closes before its host does. */
export const hasOpenDocumentLayer = (root: ParentNode) =>
  root.querySelector("[data-document-layer]") !== null;

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
  headerControlsContainer,
  statusContainer,
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
  resolveImageSource,
  embeddableFiles,
  renderLiveParticipants,
  badge,
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
    resolveImageSource,
  });
  // Live documents are edited through the session: no file saves.
  const canEditFile = editable && liveView === undefined;
  const blockMenu = useDocumentBlockMenu(editor, editable, embeddableFiles);
  const comments = useDocumentComments({
    editor,
    canComment: editable,
    author: commentAuthor,
    isSavable,
    sign: signCommentMessage,
    verify: verifyCommentMessage,
    live: live.binding?.comments,
  });
  const articleRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const listId = useId();
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
      <DocumentMarkdownPreview
        className={className}
        source={unsupported.source}
      />
    );
  }

  const participants =
    liveView?.status === "live" ? (liveView.participants ?? []) : [];
  const showParticipants =
    renderLiveParticipants !== undefined && participants.length > 0;
  const agent = liveView?.agent ?? null;
  const showControls = showCommentsToggle || showParticipants || agent !== null;
  // One element, so the participants keep their place before the button in a shared container.
  const controls = (
    <div className="flex items-center gap-2">
      {agent && (
        <DocumentLiveAgent
          activity={agent}
          avatar={renderCommentAuthorAvatar(
            { kind: "agent", id: agent.agent.agentId, name: agent.agent.name },
            "xs"
          )}
        />
      )}
      {showParticipants && renderLiveParticipants(participants)}
      {showCommentsToggle && (
        <DocumentCommentsToggle
          listId={listId}
          comments={comments}
          size={headerControlsContainer ? "sm" : "xs"}
        />
      )}
    </div>
  );

  return (
    <article
      ref={articleRef}
      className={cn(
        "@container relative px-2 font-sans text-foreground antialiased print:p-0",
        className
      )}
      onKeyDownCapture={handleKeyDown}
      onKeyDown={(event) => handleDocumentEscape(event, comments)}
    >
      {showControls &&
        headerControlsContainer &&
        createPortal(controls, headerControlsContainer)}
      {statusContainer &&
        createPortal(
          <DocumentStatusIcon
            live={
              liveView && {
                status: liveView.status,
                syncing: liveView.syncing ?? false,
              }
            }
            editable={canEditFile}
            dirty={dirty}
            saving={saving}
            error={error}
            onRetry={save}
          />,
          statusContainer
        )}
      <DocumentStatus
        editable={canEditFile}
        dirty={dirty}
        saving={saving}
        error={error}
        withSaveStatus={!statusContainer}
        autosaveDebounceMs={autosaveDebounceMs}
        onRetry={save}
        controls={showControls && !headerControlsContainer && controls}
        badge={badge}
      >
        {liveView && !statusContainer && (
          <DocumentLiveStatus status={liveView.status} />
        )}
      </DocumentStatus>
      {editor && showCommentsToggle && (
        <DocumentCommentsList
          id={listId}
          comments={comments}
          renderCommentBody={renderCommentBody}
          commentInputExtensions={commentInputExtensions}
          mountPortalContainer={mountPortalContainer}
          renderAuthorAvatar={renderCommentAuthorAvatar}
        />
      )}
      {editor && comments.unresolved.length > 0 && (
        <DocumentCommentMarkers
          editor={editor}
          comments={comments}
          containerRef={articleRef}
          mountPortalContainer={mountPortalContainer}
        />
      )}
      <div
        ref={contentRef}
        className={cn(
          "relative mx-auto max-w-[50rem] px-5 @sm:px-12 print:max-w-none print:p-0",
          // The comment bubbles sit in the right gutter, so narrow documents widen it for them.
          comments.unresolved.length > 0 && "pr-10"
        )}
      >
        <DocumentSaveError
          editable={canEditFile}
          dirty={dirty}
          saving={saving}
          error={error}
        />
        {editable && (
          <DocumentEditingControls
            editor={editor}
            comments={comments}
            blockMenu={blockMenu}
          />
        )}
        {/* Only catches clicks bubbling from highlights; keyboard users reach comments through
            the markers and the list. */}
        <div
          role="presentation"
          onClick={(event) => comments.revealClicked(event.target)}
        >
          <EditorContent editor={editor} />
        </div>
        {editor && (
          <DocumentCommentCard
            editor={editor}
            comments={comments}
            containerRef={contentRef}
            renderCommentBody={renderCommentBody}
            commentInputExtensions={commentInputExtensions}
            mountPortalContainer={mountPortalContainer}
            renderAuthorAvatar={renderCommentAuthorAvatar}
          />
        )}
      </div>
    </article>
  );
};
