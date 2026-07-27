import {
  Icon,
  LoadingBlock,
  ScrollArea,
  SearchInput,
  SearchMd,
} from "@dust-tt/sparkle";
import React from "react";

import type {
  KnowledgeTreeGroup,
  KnowledgeTreeNode,
} from "../data/knowledgeItems";
import {
  KnowledgeBreadcrumbBar,
  KnowledgeBrowseRow,
  KnowledgeFileRow,
  KnowledgeGroupHeader,
} from "./KnowledgeRow";

export const KNOWLEDGE_LISTBOX_ID = "knowledge-suggestions-listbox";

interface KnowledgeSuggestionPanelProps {
  mode: "inline" | "button";
  query: string;
  onQueryChange?: (query: string) => void;
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;

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
  mode,
  query,
  onQueryChange,
  onSearchKeyDown,
  searchInputRef,
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
      {mode === "button" && (
        <div className="border-b border-border p-1.5">
          <SearchInput
            ref={searchInputRef}
            name="knowledge-search"
            placeholder="Search knowledge…"
            value={query}
            onChange={(value) => onQueryChange?.(value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>
      )}
      {!isFiltering && browseStack.length > 0 && (
        <div
          className="border-b border-border"
          onMouseDown={(e) => e.preventDefault()}
        >
          <KnowledgeBreadcrumbBar
            stack={browseStack}
            onNavigate={onBreadcrumbNavigate}
          />
        </div>
      )}
      <ScrollArea
        id={KNOWLEDGE_LISTBOX_ID}
        role="listbox"
        className="h-72 px-1.5 py-1.5"
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
      <div
        className="flex items-center gap-3 whitespace-nowrap border-t border-border px-2.5 py-1.5 text-xs text-muted-foreground"
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="flex items-center gap-1">
          <Kbd>↑↓</Kbd> Navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> Select
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⇧↵</Kbd> Attach
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> Close
        </span>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-muted-background px-1 font-sans text-[10px] leading-4">
      {children}
    </kbd>
  );
}
