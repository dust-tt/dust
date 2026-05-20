import {
  canMoveFileToParentFolder,
  getFileExplorerDropSurfaceClassName,
  setFileExplorerDragData,
  useFileExplorerDropTarget,
} from "@app/components/file_explorer/fileExplorerDragDrop";
import type {
  ContentNodeEntry,
  FileEntry,
  FileExplorerMenuAction,
  FileSystemTreeNode,
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
  /** Merged onto the interactive surface (e.g. grab cursor while dragging). */
  containerClassName?: string;
  extraMenuItems?: FileExplorerMenuAction[];
  /** When set, replaces default hover / background (e.g. drop-target highlight). */
  surfaceClassName?: string;
  onDownload?: () => Promise<void>;
  onOpen: () => void;
  subtitle: string;
  title: string;
  titleClassName?: string;
  viewMode: ViewMode;
} & (
  | { kind: "icon"; visual: React.ComponentType }
  | { kind: "thumbnail"; thumbnailSrc: string | null }
);

// TODO(2026-04-27 FILE SYSTEM): Candidate for Sparkle once the GCS file explorer pattern stabilises.
export function FileExplorerItem(props: FileExplorerItemProps) {
  const {
    containerClassName,
    extraMenuItems,
    onDownload,
    onOpen,
    surfaceClassName,
    subtitle,
    title,
    titleClassName,
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
          containerClassName,
          surfaceClassName ??
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
          containerClassName,
          surfaceClassName ??
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

function FileExplorerDropTargetWrapper({
  children,
  disabled,
  onDrop,
  parentRelativePath,
}: {
  children: (props: {
    surfaceClassName: string | undefined;
  }) => React.ReactNode;
  disabled?: boolean;
  onDrop?: (scopedFilePath: string, parentRelativePath: string) => void;
  parentRelativePath: string;
}) {
  const { isDragOver, dropTargetProps } = useFileExplorerDropTarget({
    disabled: disabled || !onDrop,
    onDrop: (scopedFilePath) => {
      if (
        onDrop &&
        canMoveFileToParentFolder(scopedFilePath, parentRelativePath)
      ) {
        onDrop(scopedFilePath, parentRelativePath);
      }
    },
  });

  return (
    <div {...dropTargetProps}>
      {children({
        surfaceClassName: getFileExplorerDropSurfaceClassName(isDragOver),
      })}
    </div>
  );
}

export interface FileExplorerGoUpCardProps {
  parentLabel: string;
  parentRelativePath: string;
  viewMode: ViewMode;
  onGoUp: () => void;
  onMoveFileDrop?: (scopedFilePath: string, parentRelativePath: string) => void;
}

export function FileExplorerGoUpCard({
  parentLabel,
  parentRelativePath,
  viewMode,
  onGoUp,
  onMoveFileDrop,
}: FileExplorerGoUpCardProps) {
  return (
    <FileExplorerDropTargetWrapper
      disabled={!onMoveFileDrop}
      onDrop={onMoveFileDrop}
      parentRelativePath={parentRelativePath}
    >
      {({ surfaceClassName }) => (
        <FileExplorerItem
          kind="icon"
          visual={ArrowLeftIcon}
          viewMode={viewMode}
          title="Back"
          subtitle={`Browse "${parentLabel}"`}
          surfaceClassName={surfaceClassName}
          onOpen={onGoUp}
        />
      )}
    </FileExplorerDropTargetWrapper>
  );
}

export interface FileExplorerFolderCardProps {
  node: FileSystemTreeNode;
  viewMode: ViewMode;
  onNavigate: (node: FileSystemTreeNode) => void;
  onMoveFileDrop?: (scopedFilePath: string, parentRelativePath: string) => void;
}

export function FileExplorerFolderCard({
  node,
  viewMode,
  onNavigate,
  onMoveFileDrop,
}: FileExplorerFolderCardProps) {
  const childCount = node.children.length;
  const subtitle =
    childCount === 0
      ? "Empty"
      : childCount === 1
        ? "1 item"
        : `${childCount} items`;

  return (
    <FileExplorerDropTargetWrapper
      disabled={!onMoveFileDrop}
      onDrop={onMoveFileDrop}
      parentRelativePath={node.path}
    >
      {({ surfaceClassName }) => (
        <FileExplorerItem
          kind="icon"
          visual={FolderIcon}
          viewMode={viewMode}
          title={node.name}
          titleClassName="font-semibold"
          subtitle={subtitle}
          surfaceClassName={surfaceClassName}
          onOpen={() => onNavigate(node)}
        />
      )}
    </FileExplorerDropTargetWrapper>
  );
}

export interface FileExplorerFileCardProps {
  draggable?: boolean;
  entry: FileEntry;
  viewMode: ViewMode;
  onOpen: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => Promise<void>;
  extraMenuItems?: FileExplorerMenuAction[];
}

function FileExplorerDraggableWrapper({
  children,
  draggable,
  onDragStart,
  viewMode,
}: {
  children: React.ReactNode;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  viewMode: ViewMode;
}) {
  const [isDragging, setIsDragging] = useState(false);

  if (!draggable) {
    return <>{children}</>;
  }

  return (
    <div
      draggable
      className={cn(
        viewMode === "grid" && "flex flex-col gap-1",
        isDragging && "opacity-50"
      )}
      onDragStart={(e) => {
        onDragStart(e);
        setIsDragging(true);
      }}
      onDragEnd={() => {
        setIsDragging(false);
      }}
    >
      {children}
    </div>
  );
}

export function FileExplorerFileCard({
  draggable: draggableProp = false,
  entry,
  viewMode,
  onOpen,
  onDownload,
  extraMenuItems,
}: FileExplorerFileCardProps) {
  const subtitle = getFileSubtitle(entry, viewMode);

  const handleDragStart = (e: React.DragEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("button")) {
      e.preventDefault();
      return;
    }
    setFileExplorerDragData(e.dataTransfer, entry.path);
  };

  const dragContainerClassName = draggableProp
    ? "cursor-grab active:cursor-grabbing"
    : undefined;

  const item =
    getCategoryFromContentType(entry.contentType) === "image" &&
    entry.thumbnailUrl ? (
      <FileExplorerItem
        kind="thumbnail"
        thumbnailSrc={entry.thumbnailUrl}
        viewMode={viewMode}
        title={entry.fileName}
        subtitle={subtitle}
        containerClassName={dragContainerClassName}
        onOpen={() => onOpen(entry)}
        onDownload={() => onDownload(entry)}
        extraMenuItems={extraMenuItems}
      />
    ) : (
      <FileExplorerItem
        kind="icon"
        visual={getFileTypeIcon(entry.contentType, entry.fileName)}
        viewMode={viewMode}
        title={entry.fileName}
        subtitle={subtitle}
        containerClassName={dragContainerClassName}
        onOpen={() => onOpen(entry)}
        onDownload={() => onDownload(entry)}
        extraMenuItems={extraMenuItems}
      />
    );

  return (
    <FileExplorerDraggableWrapper
      draggable={draggableProp}
      viewMode={viewMode}
      onDragStart={handleDragStart}
    >
      {item}
    </FileExplorerDraggableWrapper>
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
