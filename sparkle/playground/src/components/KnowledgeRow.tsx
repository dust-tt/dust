import { ChevronRight, Plus, cn, Icon } from "@dust-tt/sparkle";
import React from "react";

import { splitByMatch } from "../data/knowledgeItems";
import type { KnowledgeTreeNode } from "../data/knowledgeItems";
import { formatRelativeTime } from "../data/knowledgeItems";

const BASE_PADDING_PX = 8;
const INDENT_PX = 16;

// The dedicated "attach this folder without opening it" control — a folder
// row's main click always browses in, so attaching the whole folder needs
// its own target. Always visible (not hover-only), so it works on touch.
function AttachFolderButton({
  onAttach,
  label,
}: {
  onAttach: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Attach ${label}`}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onAttach();
      }}
      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-100 hover:bg-primary-100 hover:text-foreground"
    >
      <Icon visual={Plus} size="xs" />
    </button>
  );
}

interface KnowledgeFileRowProps {
  treeNode: KnowledgeTreeNode;
  query: string;
  isActive: boolean;
  onSelect: (treeNode: KnowledgeTreeNode) => void;
  onHover: (id: string) => void;
  // Rows under a breadcrumb group header (search results) are compact and
  // single-line, indented by `depth` — the header above already says where
  // the file lives.
  depth?: number;
  metaLabel?: string;
  // Search can surface a matched folder alongside matched files. Clicking
  // one browses into it (dropping the query); attaching the whole folder
  // goes through the dedicated "+" control instead.
  onOpen?: (treeNode: KnowledgeTreeNode) => void;
}

export function KnowledgeFileRow({
  treeNode,
  query,
  isActive,
  onSelect,
  onHover,
  depth,
  metaLabel,
  onOpen,
}: KnowledgeFileRowProps) {
  const isGrouped = depth !== undefined;
  const isFolder = treeNode.kind === "folder";

  return (
    <div
      id={treeNode.id}
      role="option"
      aria-selected={isActive}
      data-active={isActive || undefined}
      onMouseEnter={() => onHover(treeNode.id)}
      onMouseDown={(e) => {
        // Prevent the textarea/search input from losing selection before
        // the click handler runs.
        e.preventDefault();
      }}
      onClick={() => (isFolder && onOpen ? onOpen(treeNode) : onSelect(treeNode))}
      style={isGrouped ? { paddingLeft: BASE_PADDING_PX + depth * INDENT_PX } : undefined}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg transition-[background-color,transform] duration-100 ease-out motion-safe:active:scale-[0.98] data-[active]:bg-hover",
        isGrouped ? "min-h-8 pr-2" : "min-h-10 px-2"
      )}
    >
      <Icon visual={treeNode.icon} size="xs" className="shrink-0" />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-sm text-foreground">
          {splitByMatch(treeNode.label, query).map((part, index) =>
            part.matched ? (
              <span key={index} className="font-semibold text-highlight-600">
                {part.text}
              </span>
            ) : (
              <React.Fragment key={index}>{part.text}</React.Fragment>
            )
          )}
        </span>
        {!isGrouped && (
          <span className="truncate text-xs text-muted-foreground">
            {metaLabel ??
              (treeNode.lastUsedAt
                ? `${treeNode.spaceName} · ${formatRelativeTime(treeNode.lastUsedAt)}`
                : treeNode.spaceName)}
          </span>
        )}
      </div>
      {isFolder && onOpen && (
        <AttachFolderButton
          label={treeNode.label}
          onAttach={() => onSelect(treeNode)}
        />
      )}
    </div>
  );
}

export function KnowledgeGroupHeader({ pathLabel }: { pathLabel: string }) {
  return (
    <div className="flex min-h-7 items-center gap-1 pr-2 text-xs text-muted-foreground">
      <span className="truncate">{pathLabel}</span>
    </div>
  );
}

interface KnowledgeBrowseRowProps {
  node: KnowledgeTreeNode;
  isActive: boolean;
  onOpen: (node: KnowledgeTreeNode) => void;
  onSelect: (node: KnowledgeTreeNode) => void;
  onHover: (id: string) => void;
}

// One row in the browse listing — a space, a folder, or a file, all shown at
// the same single level (the current container's direct children only, so
// there's never any indentation or nesting to render). Spaces and folders
// get a trailing chevron marking them as "enterable" and a child-count
// subtitle; files get the same two-line treatment as everywhere else. A
// folder also gets the dedicated "+" control, since its main click is
// already taken by "browse in".
export function KnowledgeBrowseRow({
  node,
  isActive,
  onOpen,
  onSelect,
  onHover,
}: KnowledgeBrowseRowProps) {
  const isContainer = node.kind !== "file";
  const isFolder = node.kind === "folder";

  return (
    <div
      id={node.id}
      role="option"
      aria-selected={isActive}
      data-active={isActive || undefined}
      onMouseEnter={() => onHover(node.id)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (isContainer ? onOpen(node) : onSelect(node))}
      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 transition-[background-color,transform] duration-100 ease-out motion-safe:active:scale-[0.98] data-[active]:bg-hover"
    >
      <Icon visual={node.icon} size="xs" className="shrink-0" />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-sm text-foreground">{node.label}</span>
        <span className="truncate text-xs text-muted-foreground">
          {node.kind === "file"
            ? node.lastUsedAt
              ? `${node.spaceName} · ${formatRelativeTime(node.lastUsedAt)}`
              : node.spaceName
            : `${node.children.length} item${node.children.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {isFolder && (
        <AttachFolderButton label={node.label} onAttach={() => onSelect(node)} />
      )}
      {isContainer && (
        <Icon
          visual={ChevronRight}
          size="xs"
          className="shrink-0 text-muted-foreground"
        />
      )}
    </div>
  );
}

interface KnowledgeBreadcrumbBarProps {
  stack: KnowledgeTreeNode[];
  onNavigate: (depth: number) => void;
}

// Clickable trail above the browse listing — click a crumb to jump back to
// that level, or the root label to return to the space list.
export function KnowledgeBreadcrumbBar({
  stack,
  onNavigate,
}: KnowledgeBreadcrumbBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onNavigate(0)}
        className="rounded px-1 py-0.5 hover:bg-hover hover:text-foreground"
      >
        All spaces
      </button>
      {stack.map((node, index) => (
        <React.Fragment key={node.id}>
          <span className="text-muted-foreground/60">/</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onNavigate(index + 1)}
            disabled={index === stack.length - 1}
            className={cn(
              "rounded px-1 py-0.5",
              index === stack.length - 1
                ? "text-foreground"
                : "hover:bg-hover hover:text-foreground"
            )}
          >
            {node.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
