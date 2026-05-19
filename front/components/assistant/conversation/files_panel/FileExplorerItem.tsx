import type { SandboxTreeNode } from "@app/components/assistant/conversation/files_panel/types";
import {
  getCategoryFromContentType,
  getSingularFileCategoryLabelForContentType,
} from "@app/components/assistant/conversation/files_panel/utils";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import type { GCSMountFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import {
  type ActionCardDiffStatus,
  ArrowDownOnSquareIcon,
  Button,
  type ButtonProps,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderIcon,
  FolderOpenIcon,
  Icon,
  ListCheckIcon,
  ListIcon,
  MoreIcon,
  Spinner,
  Tooltip,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { intlFormatDistance } from "date-fns";
import type { ComponentType } from "react";
import { useState } from "react";

export type ViewMode = "grid" | "list";

export const fileExplorerCardGridClasses =
  "grid-cols-2 @xxs:grid-cols-3 @sm:grid-cols-4 @md:grid-cols-5 @lg:grid-cols-6";

interface FileExplorerItemMenuAction {
  disabled?: boolean;
  icon?: ButtonProps["icon"];
  id: string;
  label: string;
  loadingLabel?: string;
  onClick: () => Promise<void>;
}

const TITLE_DIFF_STATUS_CLASSES: Record<ActionCardDiffStatus, string> = {
  added: "text-success dark:text-success-night",
  removed: "text-warning dark:text-warning-night",
};

export type FileExplorerItemProps = {
  diffStatus?: ActionCardDiffStatus;
  onDownload?: () => Promise<void>;
  onOpen?: () => void;
  onRemove?: () => Promise<void>;
  subtitle: string;
  title: string;
  viewMode: ViewMode;
} & (
  | { kind: "icon"; visual: ComponentType }
  | { kind: "thumbnail"; thumbnailSrc: string | null }
);

// TODO(2026-04-27 FILE SYSTEM): Candidate for Sparkle once the GCS file explorer pattern stabilises.
export interface FileExplorerViewToggleProps {
  value: ViewMode;
  onValueChange: (v: ViewMode) => void;
}

export function FileExplorerViewToggle({
  value,
  onValueChange,
}: FileExplorerViewToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={value === "grid" ? ListIcon : ListCheckIcon}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem label="Grid" onClick={() => onValueChange("grid")} />
        <DropdownMenuItem label="List" onClick={() => onValueChange("list")} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// TODO(2026-04-27 FILE SYSTEM): Candidate for Sparkle once the GCS file explorer pattern stabilises.
export function FileExplorerItem(props: FileExplorerItemProps) {
  const {
    diffStatus,
    onDownload,
    onOpen,
    onRemove,
    subtitle,
    title,
    viewMode,
  } = props;

  const thumbnailContent =
    props.kind === "icon" ? (
      <Icon visual={props.visual} size={viewMode === "list" ? "sm" : "lg"} />
    ) : props.thumbnailSrc ? (
      <img
        src={props.thumbnailSrc}
        alt={title}
        className="h-full w-full object-cover"
      />
    ) : (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" />
      </div>
    );

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const menuActions: FileExplorerItemMenuAction[] = [
    ...(onDownload
      ? [
          {
            icon: ArrowDownOnSquareIcon,
            id: "download",
            label: "Download",
            loadingLabel: "Downloading…",
            onClick: onDownload,
          },
        ]
      : []),
    ...(onRemove
      ? [
          {
            icon: XMarkIcon,
            id: "remove",
            label: "Remove",
            loadingLabel: "Removing…",
            onClick: onRemove,
          },
        ]
      : []),
  ];

  const handleMenuAction = async (
    e: React.MouseEvent,
    action: FileExplorerItemMenuAction
  ) => {
    e.stopPropagation();
    setActiveActionId(action.id);
    try {
      await action.onClick();
    } finally {
      setActiveActionId(null);
      setMenuOpen(false);
    }
  };

  const menu = menuActions.length > 0 && (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        if (!open && activeActionId !== null) {
          return;
        }
        setMenuOpen(open);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          icon={MoreIcon}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {menuActions.map((action) => {
          const isActive = activeActionId === action.id;
          return (
            <DropdownMenuItem
              key={action.id}
              label={
                isActive && action.loadingLabel
                  ? action.loadingLabel
                  : action.label
              }
              icon={action.icon}
              disabled={action.disabled || activeActionId !== null}
              onClick={(e: React.MouseEvent) => handleMenuAction(e, action)}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const info = (
    <div className="flex min-w-0 flex-1 flex-col">
      <Tooltip
        tooltipTriggerAsChild
        label={title}
        trigger={
          <span
            className={cn(
              "text-sm truncate text-foreground dark:text-foreground-night leading-5",
              "justify-start",
              diffStatus && TITLE_DIFF_STATUS_CLASSES[diffStatus]
            )}
          >
            {title}
          </span>
        }
      />
      <span
        className={cn(
          "font-normal text-xs text-muted-foreground dark:text-muted-foreground-night leading-4",
          "justify-start"
        )}
      >
        {subtitle}
      </span>
    </div>
  );

  if (viewMode === "list") {
    return (
      <div
        className={cn(
          "flex items-center gap-4 rounded-xl px-3 py-2",
          onOpen &&
            "cursor-pointer hover:bg-muted-background dark:hover:bg-muted-background-night"
        )}
        onClick={onOpen}
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {thumbnailContent}
        </div>
        {info}
        {menu}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex h-24 items-center justify-center overflow-hidden rounded-xl bg-muted-background dark:bg-muted-background-night",
          onOpen && "cursor-pointer hover:brightness-95",
          props.kind === "icon" && "p-4"
        )}
        onClick={onOpen}
      >
        {thumbnailContent}
      </div>
      <div className="flex items-start justify-between gap-0.5">
        {info}
        {menu}
      </div>
    </div>
  );
}

function getFileSubtitle(entry: GCSMountFileEntry, viewMode: ViewMode): string {
  const typeLabel = getSingularFileCategoryLabelForContentType(
    entry.contentType
  );
  const timeLabel = entry.lastModifiedMs
    ? intlFormatDistance(entry.lastModifiedMs, Date.now(), {
        style: viewMode === "list" ? "long" : "narrow",
      })
    : null;
  return [typeLabel, timeLabel].filter(Boolean).join(" - ");
}

export interface FileExplorerFolderCardProps {
  node: SandboxTreeNode;
  viewMode: ViewMode;
  onNavigate: (node: SandboxTreeNode) => void;
}

export function FileExplorerFolderCard({
  node,
  viewMode,
  onNavigate,
}: FileExplorerFolderCardProps) {
  const childCount = node.children.length;
  const subtitle =
    childCount === 0
      ? "Empty"
      : childCount === 1
        ? "1 item"
        : `${childCount} items`;

  return (
    <FileExplorerItem
      kind="icon"
      visual={FolderIcon}
      viewMode={viewMode}
      title={node.name}
      subtitle={subtitle}
      onOpen={() => onNavigate(node)}
    />
  );
}

export interface FileExplorerFileCardProps {
  entry: GCSMountFileEntry;
  viewMode: ViewMode;
  onOpen: (entry: GCSMountFileEntry) => void;
  onDownload: (entry: GCSMountFileEntry) => Promise<void>;
}

export function FileExplorerFileCard({
  entry,
  viewMode,
  onOpen,
  onDownload,
}: FileExplorerFileCardProps) {
  const subtitle = getFileSubtitle(entry, viewMode);

  if (getCategoryFromContentType(entry.contentType) === "image") {
    return (
      <FileExplorerItem
        kind="thumbnail"
        thumbnailSrc={entry.thumbnailUrl}
        viewMode={viewMode}
        title={entry.fileName}
        subtitle={subtitle}
        onOpen={() => onOpen(entry)}
        onDownload={() => onDownload(entry)}
      />
    );
  }

  const FileIcon = getFileTypeIcon(entry.contentType, entry.fileName);
  return (
    <FileExplorerItem
      kind="icon"
      visual={FileIcon}
      viewMode={viewMode}
      title={entry.fileName}
      subtitle={subtitle}
      onOpen={() => onOpen(entry)}
      onDownload={() => onDownload(entry)}
    />
  );
}

export function FileExplorerEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <Icon
        visual={FolderOpenIcon}
        size="lg"
        className="text-muted-foreground dark:text-muted-foreground-night"
      />
      <p className="copy-base text-center text-muted-foreground dark:text-muted-foreground-night">
        Nothing to see here
      </p>
    </div>
  );
}
