import type { CustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { getIcon } from "@app/components/resources/resources_icons";
import type { PodApp, PodAppFrame } from "@app/types/api/pod_apps";
import {
  Card,
  CardActionButton,
  Chip,
  GitBranch01,
  Icon,
  Trash01,
} from "@dust-tt/sparkle";

interface PodAppTileProps {
  app: PodApp;
  iconByFramePath: Map<string, CustomResourceIconType>;
  defaultIcon: CustomResourceIconType;
  onOpenFrame: (frame: PodAppFrame) => void;
  /** Absent when the viewer cannot edit (no write access). */
  onClone?: () => void;
  /** Absent when the viewer cannot edit (no write access). */
  onDelete?: () => void;
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
  onClone,
  onDelete,
}: PodAppTileProps) {
  // The tile surfaces a single Frame — the app's first — as apps almost always have exactly one.
  const frame = app.frames[0] ?? null;
  // A Frame source with no FileResource row has no content to render.
  const openableFrame = frame?.fileId ? frame : null;
  const isDraft = app.functions.length === 0 && app.databases.length === 0;

  return (
    <Card
      size="sm"
      onClick={openableFrame ? () => onOpenFrame(openableFrame) : undefined}
      action={
        (onClone || onDelete) && (
          <div className="flex gap-1">
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
      <div className="flex min-w-0 grow flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon
            visual={getIcon(appIcon(app, iconByFramePath, defaultIcon))}
            size="sm"
          />
          <span className="truncate copy-sm font-semibold">{app.name}</span>
        </div>
        <span className="truncate font-mono copy-xs text-muted-foreground dark:text-muted-foreground-night">
          {frame ? frame.fileName : "No Frame in this app"}
        </span>
        <div className="flex flex-wrap gap-1">
          {isDraft && <Chip size="xs" color="primary" label="Draft" />}
          {frame?.isPinnedAsTab && (
            <Chip size="xs" color="info" label="Pinned as tab" />
          )}
        </div>
      </div>
    </Card>
  );
}
