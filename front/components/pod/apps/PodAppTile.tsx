import type { CustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { isCustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { getIcon } from "@app/components/resources/resources_icons";
import type { PodApp, PodAppFrame } from "@app/types/api/pod_apps";
import {
  ActionIcons,
  Button,
  Card,
  CardActionButton,
  Chip,
  GitBranch01,
  Icon,
  IconPicker,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Trash01,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface PodAppTileProps {
  app: PodApp;
  iconByFramePath: Map<string, CustomResourceIconType>;
  defaultIcon: CustomResourceIconType;
  onOpenFrame: (frame: PodAppFrame) => void;
  /** Absent when the viewer cannot edit (no write access). */
  onClone?: () => void;
  /** Absent when the viewer cannot edit (no write access). */
  onDelete?: () => void;
  /** Absent when the viewer cannot edit (no write access). */
  onChangeIcon?: (
    framePath: string,
    icon: CustomResourceIconType
  ) => Promise<boolean>;
}

export function PodAppTile({
  app,
  iconByFramePath,
  defaultIcon,
  onOpenFrame,
  onClone,
  onDelete,
  onChangeIcon,
}: PodAppTileProps) {
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isSavingIcon, setIsSavingIcon] = useState(false);

  // The tile surfaces a single Frame — the app's first — as apps almost always have exactly one.
  const frame = app.frames[0] ?? null;
  // A Frame source with no FileResource row has no content to render.
  const openableFrame = frame?.fileId ? frame : null;
  const isDraft = app.functions.length === 0 && app.databases.length === 0;

  // An app's icon is the one its pinned Frame tab already carries, so the Apps tab and the nav tab
  // agree on how an app looks. The tab is also the only place an icon is stored, so apps with no
  // pinned Frame show a shared default and cannot change it.
  const pinnedFrame = app.frames.find((f) => f.isPinnedAsTab) ?? null;
  const iconName =
    (pinnedFrame && iconByFramePath.get(pinnedFrame.path)) ?? defaultIcon;
  const IconComponent = getIcon(iconName);

  const canChangeIcon = Boolean(onChangeIcon && pinnedFrame);

  const handleIconSelect = async (selected: string) => {
    setIsIconPickerOpen(false);
    if (
      !isCustomResourceIconType(selected) ||
      selected === iconName ||
      !onChangeIcon ||
      !pinnedFrame
    ) {
      return;
    }
    setIsSavingIcon(true);
    await onChangeIcon(pinnedFrame.path, selected);
    setIsSavingIcon(false);
  };

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
        <div className="flex h-7 items-center gap-2">
          {canChangeIcon ? (
            <PopoverRoot
              open={isIconPickerOpen}
              onOpenChange={setIsIconPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  icon={IconComponent}
                  tooltip="Change icon"
                  disabled={isSavingIcon}
                  // The whole card opens the Frame; picking the icon must not.
                  onClick={(e) => e.stopPropagation()}
                />
              </PopoverTrigger>
              <PopoverContent
                className="w-fit p-0"
                mountPortalContainer={
                  typeof document !== "undefined" ? document.body : undefined
                }
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <IconPicker
                  icons={ActionIcons}
                  selectedIcon={iconName}
                  onIconSelect={(selected: string) =>
                    void handleIconSelect(selected)
                  }
                />
              </PopoverContent>
            </PopoverRoot>
          ) : (
            <Icon visual={IconComponent} size="sm" />
          )}
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
