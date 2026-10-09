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

// Anchors closer than this start on the same line and share one bubble.
const SAME_LINE_PX = 12;
// A bubble's height plus the space kept between two stacked bubbles.
const BUBBLE_STEP_PX = 28;

interface MarkerAnchor {
  id: string;
  /** Vertical center relative to the container's top edge. */
  center: number;
}

interface PlacedMarker {
  /** The comments starting on the bubble's line, in document order. */
  ids: string[];
  /** Vertical center relative to the container's top edge. */
  center: number;
}

/**
 * Groups anchors sorted by center into one bubble per line, each level with its line or just
 * below the previous bubble.
 */
export const placeMarkers = (anchors: MarkerAnchor[]): PlacedMarker[] => {
  const lines: PlacedMarker[] = [];
  for (const anchor of anchors) {
    const line = lines.at(-1);
    if (line && anchor.center - line.center < SAME_LINE_PX) {
      line.ids.push(anchor.id);
    } else {
      lines.push({ ids: [anchor.id], center: anchor.center });
    }
  }
  let previous = Number.NEGATIVE_INFINITY;
  return lines.map((line) => {
    previous = Math.max(line.center, previous + BUBBLE_STEP_PX);
    return { ids: line.ids, center: previous };
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

  return placeMarkers(anchors);
};

/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-markers
 * At every document width, each line where open comments with visible highlighted text start MUST
 * have one bubble in the right gutter, showing the total number of messages in their threads, and
 * no bubble MUST overlap the text or another bubble; the document MUST keep that gutter wide
 * enough for a bubble while it has open comments. Each bubble MUST be level with its line, or just
 * below the previous bubble when they would overlap. Activating a bubble MUST reveal the comment
 * after the active one among its comments, cycling, or its first comment.
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
      {markers.map(({ ids, center }) => {
        const threads = ids.flatMap((id) => threadsById.get(id) ?? []);
        if (threads.length === 0) {
          return null;
        }
        const active = threads.findIndex((thread) => thread.id === activeId);
        const next = threads[(active + 1) % threads.length];
        const threadCount = threads.length;
        const messageCount = threads.reduce(
          (total, thread) => total + thread.messages.length,
          0
        );
        const authorName = threads[0].messages[0].author.name;

        return (
          <Tooltip
            key={ids.join(",")}
            label={
              threadCount > 1
                ? t`${plural(threadCount, { one: "# comment", other: "# comments" })}`
                : t`Comment by ${authorName}`
            }
            tooltipTriggerAsChild
            mountPortalContainer={mountPortalContainer}
            trigger={
              <button
                type="button"
                aria-label={
                  threadCount > 1
                    ? t`Show ${plural(threadCount, { one: "# comment", other: "# comments" })} with ${plural(messageCount, { one: "# message", other: "# messages" })}`
                    : t`Show comment by ${authorName}, ${plural(messageCount, { one: "# message", other: "# messages" })}`
                }
                aria-current={active >= 0 ? "true" : undefined}
                onClick={() => reveal(next.id)}
                style={{ top: center }}
                className={cn(
                  "pointer-events-auto absolute right-0 flex h-6 -translate-y-1/2 items-center gap-0.5 rounded-full border border-border bg-background px-1 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-muted-background hover:text-foreground motion-reduce:transition-none",
                  "aria-[current=true]:border-golden-300 aria-[current=true]:bg-golden-100 aria-[current=true]:text-foreground dark:aria-[current=true]:border-golden-500/60 dark:aria-[current=true]:bg-golden-400/25",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <Icon visual={MessageCircle01} size="xs" />
                <span className="tabular-nums">{messageCount}</span>
              </button>
            }
          />
        );
      })}
    </div>
  );
};
