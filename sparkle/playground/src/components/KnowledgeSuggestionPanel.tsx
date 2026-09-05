import { Icon, LoadingBlock, ScrollArea, SearchMd } from "@dust-tt/sparkle";
import React from "react";

import type {
  KnowledgeTreeGroup,
  KnowledgeTreeNode,
} from "../data/knowledgeItems";
import {
  KnowledgeBrowseRow,
  KnowledgeFileRow,
  KnowledgeGroupHeader,
  PanelSectionHeader,
} from "./KnowledgeRow";

export const KNOWLEDGE_LISTBOX_ID = "knowledge-suggestions-listbox";

interface KnowledgeSuggestionPanelProps {
  // Filtering always happens in the composer itself, right after the "/" —
  // this panel only ever reflects that query, it never owns an input.
  query: string;

  // Returns to the command menu — the step this panel was reached from.
  onBack: () => void;

  isLoading: boolean;
  activeItemId: string | null;
  onHoverItem: (id: string) => void;
  onSelectItem: (node: KnowledgeTreeNode) => void;

  // Search results: every match grouped by its exact folder, full path as
  // the breadcrumb, one fixed indent — shown whenever there's a query.
  isFiltering: boolean;
  groups: KnowledgeTreeGroup[];
  matchCount: number;

  // Browse results: the current container's direct children (or the space
  // list at the root) — shown when there's no query.
  browseStack: KnowledgeTreeNode[];
  browseChildren: KnowledgeTreeNode[];
  onOpenNode: (node: KnowledgeTreeNode) => void;
  onBreadcrumbNavigate: (depth: number) => void;
}

export function KnowledgeSuggestionPanel({
  query,
  onBack,
  isLoading,
  activeItemId,
  onHoverItem,
  onSelectItem,
  isFiltering,
  groups,
  matchCount,
  browseStack,
  browseChildren,
  onOpenNode,
  onBreadcrumbNavigate,
}: KnowledgeSuggestionPanelProps) {
  const isEmpty = isFiltering ? matchCount === 0 : browseChildren.length === 0;
  const shownCount = groups.reduce((sum, group) => sum + group.files.length, 0);

  return (
    <div className="flex w-80 flex-col">
      {/* The px-1.5 mirrors the ScrollArea's own padding, so the title lines
          up with the section headers and row labels below it. */}
      <div className="px-1.5 pt-1.5">
        <PanelSectionHeader
          label="Knowledge"
          onBack={onBack}
          backLabel="Back to commands"
          // Search results carry their own full path per group, so the trail
          // only means anything while browsing.
          trail={isFiltering ? undefined : browseStack}
          onNavigate={onBreadcrumbNavigate}
        />
      </div>
      <ScrollArea
        id={KNOWLEDGE_LISTBOX_ID}
        role="listbox"
        className="h-72 px-1.5 pb-1.5"
        onMouseDown={(e) => {
          // Rows guard their own mousedown, but the gaps between them and
          // the scroll padding don't — without this, a click that misses a
          // row by a pixel blurs the textarea/search input and ends the
          // picker session entirely.
          e.preventDefault();
        }}
      >
        {isLoading ? (
          <div className="flex flex-col gap-1.5 p-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <LoadingBlock key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-3 text-center">
            <div className="rounded-full bg-muted-background p-2.5">
              <Icon
                visual={SearchMd}
                size="md"
                className="text-muted-foreground"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {isFiltering ? (
                <>
                  No knowledge found for{" "}
                  <span className="font-medium text-foreground">“{query}”</span>
                </>
              ) : (
                "No knowledge available here"
              )}
            </p>
          </div>
        ) : isFiltering ? (
          <div className="flex flex-col gap-1.5">
            {groups.map((group) => (
              <div key={group.id} className="flex flex-col">
                <KnowledgeGroupHeader pathLabel={group.pathLabel} />
                {group.files.map((file) => (
                  <KnowledgeFileRow
                    key={file.id}
                    treeNode={file}
                    query={query}
                    isActive={file.id === activeItemId}
                    onSelect={onSelectItem}
                    onOpen={onOpenNode}
                    onHover={onHoverItem}
                    depth={1}
                  />
                ))}
              </div>
            ))}
            {shownCount < matchCount && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Showing {shownCount} of {matchCount} — refine your search to see
                more.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {browseChildren.map((node) => (
              <KnowledgeBrowseRow
                key={node.id}
                node={node}
                isActive={node.id === activeItemId}
                onOpen={onOpenNode}
                onSelect={onSelectItem}
                onHover={onHoverItem}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
