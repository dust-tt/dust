import type {
  ContentNodeEntry,
  FileEntry,
  FileExplorerMenuAction,
  SandboxTreeNode,
} from "@app/components/file_explorer/types";
import {
  getCategoryFromContentType,
  getSingularFileCategoryLabelForContentType,
} from "@app/components/file_explorer/utils";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import type { GCSMountFileEntry } from "@app/lib/api/files/gcs_mount/files";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  ArrowDownOnSquareIcon,
  ArrowLeftIcon,
  Button,
  CloudArrowLeftRightIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderIcon,
  FolderOpenIcon,
  Icon,
  MoreIcon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { intlFormatDistance } from "date-fns";
import type React from "react";
import { useState } from "react";

export type ViewMode = "grid" | "list";

export type FileExplorerItemProps = {
  onDownload?: () => Promise<void>;
  onOpen: () => void;
  subtitle: string;
  title: string;
  titleClassName?: string;
  viewMode: ViewMode;
  extraMenuItems?: FileExplorerMenuAction[];
} & (
  | { kind: "icon"; visual: React.ComponentType }
  | { kind: "thumbnail"; thumbnailSrc: string | null }
);

// TODO(2026-04-27 FILE SYSTEM): Candidate for Sparkle once the GCS file explorer pattern stabilises.
export function FileExplorerItem(props: FileExplorerItemProps) {
  const {
    onDownload,
    onOpen,
    subtitle,
    title,
    titleClassName,
    viewMode,
    extraMenuItems,
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
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    if (!onDownload) {
      return;
    }
    e.stopPropagation();
    setIsDownloading(true);
    try {
      await onDownload();
    } finally {
      setIsDownloading(false);
      setMenuOpen(false);
    }
  };

  const hasMenu = onDownload || (extraMenuItems && extraMenuItems.length > 0);

  const menu = hasMenu ? (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        if (!open && isDownloading) {
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
        {onDownload && (
          <DropdownMenuItem
            label={isDownloading ? "Downloading…" : "Download"}
            icon={ArrowDownOnSquareIcon}
            disabled={isDownloading}
            onClick={handleDownload}
          />
        )}
        {extraMenuItems?.map((item, i) => (
          <DropdownMenuItem
            key={i}
            label={item.label}
            icon={item.icon}
            variant={item.variant}
            onClick={item.onClick}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

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
              titleClassName
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
          "flex cursor-pointer items-center gap-4 rounded-xl px-3 py-2",
          "hover:bg-muted-background dark:hover:bg-muted-background-night"
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
          "flex h-24 cursor-pointer items-center justify-center overflow-hidden rounded-xl",
          "bg-muted-background hover:brightness-95 dark:bg-muted-background-night",
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

export interface FileExplorerGoUpCardProps {
  parentLabel: string;
  viewMode: ViewMode;
  onGoUp: () => void;
}

export function FileExplorerGoUpCard({
  parentLabel,
  viewMode,
  onGoUp,
}: FileExplorerGoUpCardProps) {
  return (
    <FileExplorerItem
      kind="icon"
      visual={ArrowLeftIcon}
      viewMode={viewMode}
      title="Back"
      subtitle={`Browse "${parentLabel}"`}
      onOpen={onGoUp}
    />
  );
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
      titleClassName="font-semibold"
      subtitle={subtitle}
      onOpen={() => onNavigate(node)}
    />
  );
}

export interface FileExplorerFileCardProps {
  entry: FileEntry;
  viewMode: ViewMode;
  onOpen: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => Promise<void>;
  extraMenuItems?: FileExplorerMenuAction[];
}

export function FileExplorerFileCard({
  entry,
  viewMode,
  onOpen,
  onDownload,
  extraMenuItems,
}: FileExplorerFileCardProps) {
  const subtitle = getFileSubtitle(entry, viewMode);

  if (
    getCategoryFromContentType(entry.contentType) === "image" &&
    entry.thumbnailUrl
  ) {
    return (
      <FileExplorerItem
        kind="thumbnail"
        thumbnailSrc={entry.thumbnailUrl}
        viewMode={viewMode}
        title={entry.fileName}
        subtitle={subtitle}
        onOpen={() => onOpen(entry)}
        onDownload={() => onDownload(entry)}
        extraMenuItems={extraMenuItems}
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
      extraMenuItems={extraMenuItems}
    />
  );
}

export interface ContentNodeCardProps {
  entry: ContentNodeEntry;
  viewMode: ViewMode;
  onOpen: (entry: ContentNodeEntry) => void;
  extraMenuItems?: FileExplorerMenuAction[];
}

export function ContentNodeCard({
  entry,
  viewMode,
  onOpen,
  extraMenuItems,
}: ContentNodeCardProps) {
  const ProviderIcon = getConnectorProviderLogoWithFallback({
    provider: entry.connectorProvider,
    fallback: CloudArrowLeftRightIcon,
  });

  return (
    <FileExplorerItem
      kind="icon"
      visual={ProviderIcon}
      viewMode={viewMode}
      title={entry.fileName}
      subtitle="Knowledge"
      onOpen={() => onOpen(entry)}
      extraMenuItems={extraMenuItems}
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
