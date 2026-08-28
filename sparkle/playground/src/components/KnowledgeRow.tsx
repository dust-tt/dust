import {
  Avatar,
  Button,
  ChevronLeft,
  ChevronRight,
  cn,
  Icon,
} from "@dust-tt/sparkle";
import React from "react";

import { splitByMatch } from "../data/knowledgeItems";
import type { KnowledgeTreeNode } from "../data/knowledgeItems";
import { formatRelativeTime } from "../data/knowledgeItems";

const BASE_PADDING_PX = 8;
const INDENT_PX = 16;

// Production wraps first-level slash-menu row icons in ResourceAvatar —
// Avatar with the resource tokens — rather than rendering a bare Icon.
// `front`'s version isn't importable here, so this mirrors it, including the
// separate palette skills get.
const AVATAR_TONES = {
  // front/components/resources/resources_icons.tsx → ResourceAvatar defaults.
  neutral: {
    backgroundColor: "bg-muted-background",
    iconColor: "text-foreground",
  },
  // front/lib/skill.ts → SKILL_AVATAR_BACKGROUND_COLOR / _ICON_COLOR.
  skill: {
    backgroundColor: "bg-highlight-50",
    iconColor: "text-highlight",
  },
} as const;

export type RowAvatarTone = keyof typeof AVATAR_TONES;

export function RowAvatar({
  icon,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: RowAvatarTone;
}) {
  const { backgroundColor, iconColor } = AVATAR_TONES[tone];

  return (
    <Avatar
      size="sm"
      icon={icon}
      backgroundColor={backgroundColor}
      iconColor={iconColor}
      className="shrink-0"
    />
  );
}

// sparkle's DropdownMenuItem: heading-sm label inheriting a muted row colour
// that resolves to foreground on hover/selection, p-2, gap-2.5 to the icon.
export const ROW_CLASSES = cn(
  "group flex cursor-pointer select-none items-center gap-2.5 rounded-lg p-2",
  "heading-sm text-muted-foreground",
  "transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.98]",
  "hover:bg-hover hover:text-foreground",
  "data-[active]:bg-hover data-[active]:text-foreground"
);

// DropdownMenuItem's own description styling.
export const ROW_DESCRIPTION_CLASSES =
  "truncate text-xs font-normal text-muted-foreground";

// The dedicated "attach this folder without opening it" control — a folder
// row's main click always browses in, so attaching the whole folder needs
// its own target. Always visible (not hover-only), so it works on touch.
// Labelled rather than a bare "+": the text says what it does, and it no
// longer needs an invisible expanded hit area, which used to reach almost
// all the way to the row's browse chevron.
//
// Revealed contextually, the way production reveals its own row action — but
// keyed to hover *and* keyboard selection, and left permanently visible where
// there is no hover to begin with. Attaching a whole folder has no other
// entry point on touch (the row's own tap browses in), so hiding it outright
// would strand those users.
// Not a tab stop: Shift+Enter already reaches this through the listbox's
// virtual-focus model (aria-activedescendant), and a real focusable button
// nested inside those rows would hijack Tab into a per-row walk instead of
// leaving the field.
function AttachFolderButton({
  onAttach,
  label,
}: {
  onAttach: () => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      label="Add"
      aria-label={`Add ${label}`}
      tabIndex={-1}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onAttach();
      }}
      // Opacity rather than conditional rendering: the row must not reflow
      // when the pointer enters it.
      className={cn(
        "transition-opacity duration-100",
        "[@media(hover:hover)]:opacity-0",
        "group-hover:opacity-100 group-data-[active]:opacity-100"
      )}
    />
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
      onClick={() =>
        isFolder && onOpen ? onOpen(treeNode) : onSelect(treeNode)
      }
      style={
        isGrouped
          ? { paddingLeft: BASE_PADDING_PX + depth * INDENT_PX }
          : undefined
      }
      className={ROW_CLASSES}
    >
      <Icon visual={treeNode.icon} size="md" className="shrink-0" />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate">
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
          <span className={ROW_DESCRIPTION_CLASSES}>
            {metaLabel ??
              (treeNode.lastUsedAt
                ? `${treeNode.spaceName} · ${formatRelativeTime(treeNode.lastUsedAt)}`
                : treeNode.spaceName)}
          </span>
        )}
      </div>
      {isFolder && onOpen && (
        <>
          <AttachFolderButton
            label={treeNode.label}
            onAttach={() => onSelect(treeNode)}
          />
          <Icon
            visual={ChevronRight}
            size="xs"
            className="ml-1 shrink-0 text-muted-foreground"
          />
        </>
      )}
    </div>
  );
}

const CRUMB_CLASSES =
  "relative shrink-0 truncate rounded px-1 py-1 before:absolute before:inset-x-0 before:-inset-y-2";

interface PanelSectionHeaderProps {
  label: string;
  // When present a back chevron renders to the left of the label — the
  // knowledge step uses it to return to the command menu. Shared with the
  // slash menu's own section headers so the two read as the same thing.
  onBack?: () => void;
  backLabel?: string;
  // When set, `label` becomes the root crumb of a breadcrumb trail rendered
  // on this same line — clicking it returns to the top of the tree. Keeping
  // the trail in the header means there's one place that says where you are,
  // rather than a title and a separate bar repeating each other.
  trail?: KnowledgeTreeNode[];
  onNavigate?: (depth: number) => void;
}

export function PanelSectionHeader({
  label,
  onBack,
  backLabel,
  trail,
  onNavigate,
}: PanelSectionHeaderProps) {
  const hasTrail = Boolean(trail && trail.length > 0 && onNavigate);

  return (
    <div
      className="flex items-center gap-1 overflow-hidden px-2 py-2 heading-xs text-muted-foreground"
      onMouseDown={(e) => e.preventDefault()}
    >
      {onBack && (
        <button
          type="button"
          aria-label={backLabel ?? "Go back"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBack}
          // The icon is a 16px square, well under a comfortable tap target,
          // so `before` stretches the hit area out past the visible bounds.
          className="relative shrink-0 rounded p-0.5 before:absolute before:-inset-2 hover:bg-hover hover:text-foreground"
        >
          <Icon visual={ChevronLeft} size="xs" />
        </button>
      )}
      {!hasTrail ? (
        <span className="truncate">{label}</span>
      ) : (
        <>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onNavigate?.(0)}
            // -ml-1 cancels the crumb's own left padding, which would
            // otherwise stack on the container's gap and sit the label
            // further from the back arrow than the plain-label case does.
            className={cn(
              CRUMB_CLASSES,
              "-ml-1 hover:bg-hover hover:text-foreground"
            )}
          >
            {label}
          </button>
          {trail?.map((node, index) => {
            const isLast = index === trail.length - 1;
            return (
              <React.Fragment key={node.id}>
                <span className="shrink-0 text-muted-foreground/60">/</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onNavigate?.(index + 1)}
                  disabled={isLast}
                  className={cn(
                    CRUMB_CLASSES,
                    // The deepest crumb is where you already are: readable,
                    // but not offering a no-op navigation.
                    isLast
                      ? "min-w-0 text-foreground"
                      : "hover:bg-hover hover:text-foreground"
                  )}
                >
                  {node.label}
                </button>
              </React.Fragment>
            );
          })}
        </>
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
      className={ROW_CLASSES}
    >
      <Icon visual={node.icon} size="md" className="shrink-0" />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate">{node.label}</span>
        <span className={ROW_DESCRIPTION_CLASSES}>
          {node.kind === "file"
            ? node.lastUsedAt
              ? `${node.spaceName} · ${formatRelativeTime(node.lastUsedAt)}`
              : node.spaceName
            : `${node.children.length} item${node.children.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {isFolder && (
        <AttachFolderButton
          label={node.label}
          onAttach={() => onSelect(node)}
        />
      )}
      {isContainer && (
        <Icon
          visual={ChevronRight}
          size="xs"
          className="ml-1 shrink-0 text-muted-foreground"
        />
      )}
    </div>
  );
}
