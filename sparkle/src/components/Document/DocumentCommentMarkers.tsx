import { Icon } from "@sparkle/components/Icon";
import { Tooltip } from "@sparkle/components/Tooltip";
import { MessageTextCircle01 } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import type { Editor } from "@tiptap/core";
import React, { type RefObject, useLayoutEffect, useState } from "react";
import type { DocumentComment } from "./types";
import {
  escapeAttributeValue,
  useEditorLayoutVersion,
} from "./useDocumentComments";

// Anchors closer than this share one marker.
const CLUSTER_DISTANCE_PX = 24;

interface MarkerCluster {
  /** Vertical center relative to the container's top edge. */
  center: number;
  ids: string[];
}

interface DocumentCommentMarkersProps {
  editor: Editor;
  /** Unresolved comments, in document order. */
  comments: DocumentComment[];
  activeId: string | null;
  containerRef: RefObject<HTMLElement>;
  onSelect: (id: string) => void;
  mountPortalContainer?: HTMLElement;
}

const measureClusters = (
  editor: Editor,
  comments: DocumentComment[],
  container: HTMLElement
): MarkerCluster[] => {
  const containerTop = container.getBoundingClientRect().top;
  const anchors = comments
    .flatMap((comment) => {
      const highlight = editor.view.dom.querySelector<HTMLElement>(
        `[data-comment-highlight="${escapeAttributeValue(comment.id)}"]`
      );
      if (!highlight) {
        return [];
      }
      const bounds = highlight.getBoundingClientRect();
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
 * @cc [owner:flvndvd,label:react] document-comment-markers
 * Each unresolved comment with visible highlighted text MUST have a marker in the right
 * gutter aligned with its first highlight. Markers on the same line MUST merge into one
 * showing the count. Activating a merged marker MUST cycle through its comments.
 */
export const DocumentCommentMarkers = ({
  editor,
  comments,
  activeId,
  containerRef,
  onSelect,
  mountPortalContainer,
}: DocumentCommentMarkersProps) => {
  const [clusters, setClusters] = useState<MarkerCluster[]>([]);
  // Measured here so document updates re-render the markers, not the whole editor chrome.
  const layoutVersion = useEditorLayoutVersion(editor);
  const commentsById = new Map(
    comments.map((comment) => [comment.id, comment])
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutVersion re-measures after document changes and resizes
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measured = container
      ? measureClusters(editor, comments, container)
      : [];
    // Keep state stable when nothing moved so measuring never re-renders in a loop.
    setClusters((current) =>
      JSON.stringify(current) === JSON.stringify(measured) ? current : measured
    );
  }, [editor, comments, containerRef, layoutVersion]);

  return (
    <div className="pointer-events-none absolute inset-y-0 right-1 hidden w-9 @sm:block print:hidden">
      {clusters.map((cluster) => {
        const active = activeId !== null ? cluster.ids.indexOf(activeId) : -1;
        const targetId = cluster.ids[(active + 1) % cluster.ids.length];
        const label =
          cluster.ids.length === 1
            ? `Comment by ${commentsById.get(cluster.ids[0])?.author.name ?? "unknown"}`
            : `${cluster.ids.length} comments`;

        return (
          <Tooltip
            key={cluster.ids.join(",")}
            label={label}
            tooltipTriggerAsChild
            mountPortalContainer={mountPortalContainer}
            trigger={
              <button
                type="button"
                aria-label={`Show ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
                aria-pressed={active >= 0}
                onClick={() => onSelect(targetId)}
                style={{ top: cluster.center }}
                className={cn(
                  "pointer-events-auto absolute right-0 flex h-7 min-w-7 -translate-y-1/2 items-center justify-center gap-1 rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
                  "aria-pressed:border-golden-500/60 aria-pressed:bg-golden-300/40 aria-pressed:text-foreground dark:aria-pressed:bg-golden-400/25",
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
