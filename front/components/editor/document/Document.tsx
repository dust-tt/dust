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
  DocumentStatus,
  StatusRow,
} from "@app/components/editor/document/DocumentSaveStatus";
import { DocumentSelectionToolbar } from "@app/components/editor/document/DocumentSelectionToolbar";
import { DocumentSourcePreview } from "@app/components/editor/document/DocumentSourcePreview";
import type { DocumentProps } from "@app/components/editor/document/types";
import { useDocumentComments } from "@app/components/editor/document/useDocumentComments";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { EditorContent } from "@app/components/editor/EditorContent";
import { cn } from "@dust-tt/sparkle";
import type React from "react";
import { useId, useRef } from "react";

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 3_000;
const DEFAULT_EXTERNAL_CHANGE_ANIMATION_MS = 8_000;

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
  content,
  className,
  mountPortalContainer,
  readOnly = false,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  externalChangeAnimationMs = DEFAULT_EXTERNAL_CHANGE_ANIMATION_MS,
  onSave,
  onStateChange,
  badge,
}: DocumentProps) => {
  const { editor, editable, unsupported, dirty, saving, error, save } =
    useDocumentEditor({
      content,
      readOnly,
      autosaveDebounceMs,
      externalChangeAnimationMs,
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
            editable={editable}
            dirty={dirty}
            saving={saving}
            error={error}
            autosaveDebounceMs={autosaveDebounceMs}
            onRetry={save}
            badge={badge}
          >
            {showCommentsToggle && (
              <DocumentCommentsToggle panelId={panelId} comments={comments} />
            )}
          </DocumentStatus>
          {editor && editable && (
            <>
              <DocumentSelectionToolbar
                editor={editor}
                mountPortalContainer={mountPortalContainer}
              />
              <DocumentBlockMenu editor={editor} menu={blockMenu} />
            </>
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
          mountPortalContainer={mountPortalContainer}
        />
      )}
    </article>
  );
};
