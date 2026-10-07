import { getCommentHighlights } from "@app/components/editor/document/DocumentComments";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { useEditorLayoutVersion } from "@app/components/editor/document/useEditorLayoutVersion";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { cn, Icon, MessageTextCircle01, Tooltip } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/core";
import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

// Anchors closer than this share one marker.
const CLUSTER_DISTANCE_PX = 24;

interface MarkerCluster {
  /** Vertical center relative to the container's top edge. */
  center: number;
  ids: string[];
}

interface DocumentCommentMarkersProps {
  editor: Editor;
  comments: DocumentCommentsController;
  containerRef: RefObject<HTMLElement | null>;
  mountPortalContainer?: HTMLElement;
}

const measureClusters = (
  editor: Editor,
  comments: DfmComment[],
  container: HTMLElement
): MarkerCluster[] => {
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
  const clusters: MarkerCluster[] = [];

  for (const anchor of anchors) {
    const last = clusters[clusters.length - 1];
    if (last && anchor.center - last.center < CLUSTER_DISTANCE_PX) {
      last.ids.push(anchor.id);
    } else {
      clusters.push({ center: anchor.center, ids: [anchor.id] });
    }
  }

  return clusters;
};

/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-markers
 * In containers at least `@sm` wide, each open comment with visible highlighted text MUST
 * have a marker in the right gutter aligned with its first highlight. Markers on the same
 * line MUST merge into one showing the count. Activating a merged marker MUST cycle through
 * its comments.
 */
export const DocumentCommentMarkers = ({
  editor,
  comments,
  containerRef,
  mountPortalContainer,
}: DocumentCommentMarkersProps) => {
  const { t } = useLingui();
  const { unresolved, activeId, reveal } = comments;
  const [clusters, setClusters] = useState<MarkerCluster[]>([]);
  // Measured here so document updates re-render the markers, not the whole editor chrome.
  const layoutVersion = useEditorLayoutVersion(editor, containerRef);
  const authorsById = new Map(
    unresolved.map((comment) => [comment.id, comment.messages[0].author.name])
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    setClusters(
      container ? measureClusters(editor, unresolved, container) : []
    );
  }, [editor, unresolved, containerRef, layoutVersion]);

  return (
    <div className="pointer-events-none absolute inset-y-0 right-1 hidden w-9 @sm:block print:hidden">
      {clusters.map((cluster) => {
        const active = activeId !== null ? cluster.ids.indexOf(activeId) : -1;
        const targetId = cluster.ids[(active + 1) % cluster.ids.length];
        const count = cluster.ids.length;
        const authorName = authorsById.get(cluster.ids[0]);
        let label: string;
        let ariaLabel: string;
        if (count > 1) {
          label = t`${plural(count, { one: "# comment", other: "# comments" })}`;
          ariaLabel = t`Show ${plural(count, { one: "# comment", other: "# comments" })}`;
        } else if (authorName !== undefined) {
          label = t`Comment by ${authorName}`;
          ariaLabel = t`Show comment by ${authorName}`;
        } else {
          label = t`Comment by unknown`;
          ariaLabel = t`Show comment by unknown`;
        }

        return (
          <Tooltip
            key={cluster.ids.join(",")}
            label={label}
            tooltipTriggerAsChild
            mountPortalContainer={mountPortalContainer}
            trigger={
              <button
                type="button"
                aria-label={ariaLabel}
                aria-current={active >= 0 ? "true" : undefined}
                onClick={() => reveal(targetId)}
                style={{ top: cluster.center }}
                className={cn(
                  "pointer-events-auto absolute right-0 flex h-7 min-w-7 -translate-y-1/2 items-center justify-center gap-1 rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
                  "aria-[current=true]:border-golden-500/60 aria-[current=true]:bg-golden-300/40 aria-[current=true]:text-foreground dark:aria-[current=true]:bg-golden-400/25",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  cluster.ids.length > 1 && "px-2"
                )}
              >
                <Icon visual={MessageTextCircle01} size="xs" />
                {cluster.ids.length > 1 && (
                  <span className="text-xs font-medium tabular-nums">
                    {cluster.ids.length}
                  </span>
                )}
              </button>
            }
          />
        );
      })}
    </div>
  );
};
