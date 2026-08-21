import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import type { PodApp, PodAppFrame } from "@app/types/api/pod_apps";
import type { CustomResourceIconType } from "@app/types/resources_icon_names";
import {
  Card,
  CardActionButton,
  Chip,
  Download01,
  Edit04,
  GitBranch01,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface PodAppTileProps {
  app: PodApp;
  iconByFramePath: Map<string, CustomResourceIconType>;
  defaultIcon: CustomResourceIconType;
  onOpenFrame: (frame: PodAppFrame) => void;
  /** Download this app as a portable archive. Available to every viewer with read access. */
  onDownload: () => Promise<void>;
  /** Absent when the viewer cannot edit (no write access). */
  onEdit?: () => void;
  /** Absent when the viewer cannot edit (no write access). */
  onClone?: () => void;
  /** Absent when the viewer cannot edit (no write access). */
  onDelete?: () => void;
  /** Deletion is in flight: the tile stays put, inert, until the app is actually gone. */
  isDeleting: boolean;
}

/**
 * An app's icon is the one its pinned Frame tab already carries, so the Apps tab and the nav tab
 * agree on how an app looks. Apps with no pinned Frame fall back to a shared default.
 */
function appIcon(
  app: PodApp,
  iconByFramePath: Map<string, CustomResourceIconType>,
  defaultIcon: CustomResourceIconType
): CustomResourceIconType {
  for (const frame of app.frames) {
    const icon = iconByFramePath.get(frame.path);
    if (icon) {
      return icon;
    }
  }

  return defaultIcon;
}

export function PodAppTile({
  app,
  iconByFramePath,
  defaultIcon,
  onOpenFrame,
  onDownload,
  onEdit,
  onClone,
  onDelete,
  isDeleting,
}: PodAppTileProps) {
  // The tile surfaces a single Frame — the app's first — as apps almost always have exactly one.
  const frame = app.frames[0] ?? null;
  // A Frame source with no FileResource row has no content to render.
  const openableFrame = frame?.fileId ? frame : null;
  const isDraft = app.functions.length === 0 && app.databases.length === 0;

  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    await onDownload();
    setIsDownloading(false);
  }, [onDownload]);

  return (
    <Card
      size="md"
      className={isDeleting ? "opacity-50" : undefined}
      onClick={
        openableFrame && !isDeleting
          ? () => onOpenFrame(openableFrame)
          : undefined
      }
      action={
        isDeleting ? (
          <Spinner size="xs" />
        ) : (
          <div className="flex gap-1">
            {onEdit && (
              <CardActionButton
                size="icon"
                icon={Edit04}
                tooltip="Ask an agent to modify this app"
                onClick={onEdit}
              />
            )}
            <CardActionButton
              size="icon"
              icon={Download01}
              tooltip="Download this app as a portable archive"
              onClick={() => void handleDownload()}
              isLoading={isDownloading}
            />
            {onClone && (
              <CardActionButton
                size="icon"
                icon={GitBranch01}
                tooltip="Clone this app into a new folder, with empty databases"
                onClick={onClone}
              />
            )}
            {onDelete && (
              <CardActionButton
                size="icon"
                icon={Trash01}
                tooltip="Delete this app and everything it owns"
                onClick={onDelete}
              />
            )}
          </div>
        )
      }
    >
      {/*
        The icon row shares its band with the actions `Card` pins to the top-right corner, so the
        name goes on the row below and gets the tile's full width rather than running under (or
        truncating ahead of) the buttons.
      */}
      <div className="flex min-w-0 grow flex-col items-start gap-3">
        <ResourceAvatar
          icon={getIcon(appIcon(app, iconByFramePath, defaultIcon))}
          size="md"
          backgroundColor="bg-background dark:bg-background-night"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate heading-base text-foreground dark:text-foreground-night">
              {app.name}
            </span>
            {isDraft && !isDeleting && (
              <Chip
                size="xs"
                color="primary"
                label="Draft"
                className="shrink-0"
              />
            )}
          </div>
          {isDeleting && (
            <span className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
              Deleting…
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
