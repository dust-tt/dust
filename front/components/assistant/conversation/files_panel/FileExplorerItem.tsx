import type { SandboxTreeNode } from "@app/components/assistant/conversation/files_panel/types";
import {
  getCategoryFromContentType,
  getSingularFileCategoryLabelForContentType,
} from "@app/components/assistant/conversation/files_panel/utils";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { getFileProcessedUrl } from "@app/lib/swr/files";
import type { GCSMountFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
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
import moment from "moment";

export type ViewMode = "grid" | "list";

export type FileExplorerItemProps = {
  onDownload?: () => void;
  onOpen: () => void;
  subtitle: string;
  title: string;
  viewMode: ViewMode;
} & (
  | { kind: "icon"; visual: React.ComponentType }
  | { kind: "thumbnail"; thumbnailSrc: string | null }
);

// TODO(2026-04-27 FILE SYSTEM): Candidate for Sparkle once the GCS file explorer pattern stabilises.
export function FileExplorerItem(props: FileExplorerItemProps) {
  const { onDownload, onOpen, subtitle, title, viewMode } = props;

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

  const menu = onDownload && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          icon={MoreIcon}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="Download"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onDownload();
          }}
        />
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
              "text-sm font-medium truncate text-foreground dark:text-foreground-night leading-5",
              "justify-start"
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
          "flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-4 transition-colors",
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
          "bg-muted-background transition-colors hover:brightness-95 dark:bg-muted-background-night",
          props.kind === "icon" && "p-4"
        )}
        onClick={onOpen}
      >
        {thumbnailContent}
      </div>
      <div className="flex items-start justify-between gap-1">
        {info}
        {menu}
      </div>
    </div>
  );
}

function getFileSubtitle(entry: GCSMountFileEntry): string {
  const typeLabel = getSingularFileCategoryLabelForContentType(
    entry.contentType
  );
  const timeLabel = entry.lastModifiedMs
    ? moment(entry.lastModifiedMs).fromNow()
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
  owner: LightWorkspaceType;
  viewMode: ViewMode;
  onOpen: (entry: GCSMountFileEntry) => void;
  onDownload: (entry: GCSMountFileEntry) => void;
}

export function FileExplorerFileCard({
  entry,
  owner,
  viewMode,
  onOpen,
  onDownload,
}: FileExplorerFileCardProps) {
  const subtitle = getFileSubtitle(entry);

  // TODO(2026-04-27 FILE SYSTEM): Move this thumbnail logic to files endpoint.
  if (getCategoryFromContentType(entry.contentType) === "image") {
    const thumbnailSrc = entry.fileId
      ? getFileProcessedUrl(owner, entry.fileId)
      : null;

    return (
      <FileExplorerItem
        kind="thumbnail"
        thumbnailSrc={thumbnailSrc}
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
