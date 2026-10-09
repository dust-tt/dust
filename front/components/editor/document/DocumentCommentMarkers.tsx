import { getCommentHighlights } from "@app/components/editor/document/DocumentComments";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { useEditorLayoutVersion } from "@app/components/editor/document/useEditorLayoutVersion";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { cn, Icon, MessageCircle01, Tooltip } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/core";
import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

// A marker's height plus the space kept between two stacked markers.
const MARKER_STEP_PX = 28;

interface PlacedMarker {
  id: string;
  /** Vertical center relative to the container's top edge. */
  center: number;
}

/**
 * Places markers, from anchors sorted by center, level with their anchor or just below the
 * previous marker, so markers of one line stack and push the next lines' markers down.
 */
export const stackMarkers = (anchors: PlacedMarker[]): PlacedMarker[] => {
  let previous = Number.NEGATIVE_INFINITY;
  return anchors.map(({ id, center }) => {
    previous = Math.max(center, previous + MARKER_STEP_PX);
    return { id, center: previous };
  });
};

interface DocumentCommentMarkersProps {
  editor: Editor;
  comments: DocumentCommentsController;
  containerRef: RefObject<HTMLElement | null>;
  mountPortalContainer?: HTMLElement;
}

const measureMarkers = (
  editor: Editor,
  comments: DfmComment[],
  container: HTMLElement
): PlacedMarker[] => {
  const containerTop = container.getBoundingClientRect().top;
  const highlights = getCommentHighlights(editor);
  const anchors = comments
    .flatMap((comment) => {
      const highlight = highlights.get(comment.id);
      if (!highlight) {
        return [];
      }
      // The first client rect is the first line. The bounding rect would span every
      // wrapped line and pull the marker down.
      const bounds =
        highlight.getClientRects()[0] ?? highlight.getBoundingClientRect();
      return [
        {
          id: comment.id,
          center: bounds.top + bounds.height / 2 - containerTop,
        },
      ];
    })
    .sort((a, b) => a.center - b.center);

  return stackMarkers(anchors);
};

/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-markers
 * At every document width, each open comment with visible highlighted text MUST have its own
 * marker in the right gutter, showing the number of messages in its thread, level with its first highlight or just below the previous marker,
 * so markers of comments on one line stack and push the next lines' markers down; no marker MUST
 * overlap the text or another marker. The document MUST keep that gutter wide enough for a marker
 * while it has open comments. Activating a marker MUST reveal its comment.
 */
export const DocumentCommentMarkers = ({
  editor,
  comments,
  containerRef,
  mountPortalContainer,
}: DocumentCommentMarkersProps) => {
  const { t } = useLingui();
  const { unresolved, activeId, reveal } = comments;
  const [markers, setMarkers] = useState<PlacedMarker[]>([]);
  // Measured here so document updates re-render the markers, not the whole editor chrome.
  const layoutVersion = useEditorLayoutVersion(editor, containerRef);
  const threadsById = new Map(
    unresolved.map((comment) => [comment.id, comment])
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    setMarkers(container ? measureMarkers(editor, unresolved, container) : []);
  }, [editor, unresolved, containerRef, layoutVersion]);

  return (
    <div className="pointer-events-none absolute inset-y-0 right-2 w-9 print:hidden">
      {markers.map(({ id, center }) => {
        const thread = threadsById.get(id);
        if (!thread) {
          return null;
        }
        const authorName = thread.messages[0].author.name;
        const count = thread.messages.length;

        return (
          <Tooltip
            key={id}
            label={t`Comment by ${authorName}`}
            tooltipTriggerAsChild
            mountPortalContainer={mountPortalContainer}
            trigger={
              <button
                type="button"
                aria-label={t`Show comment by ${authorName}, ${plural(count, { one: "# message", other: "# messages" })}`}
                aria-current={id === activeId ? "true" : undefined}
                onClick={() => reveal(id)}
                style={{ top: center }}
                className={cn(
                  "pointer-events-auto absolute right-0 flex h-6 -translate-y-1/2 items-center gap-0.5 rounded-full border border-border bg-background px-1 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-muted-background hover:text-foreground motion-reduce:transition-none",
                  "aria-[current=true]:border-golden-300 aria-[current=true]:bg-golden-100 aria-[current=true]:text-foreground dark:aria-[current=true]:border-golden-500/60 dark:aria-[current=true]:bg-golden-400/25",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <Icon visual={MessageCircle01} size="xs" />
                <span className="tabular-nums">{count}</span>
              </button>
            }
          />
        );
      })}
    </div>
  );
};
