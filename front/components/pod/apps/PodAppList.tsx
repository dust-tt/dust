import type { CustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { getIcon } from "@app/components/resources/resources_icons";
import type { PodApp } from "@app/types/api/pod_apps";
import { Chip, cn, Icon, ScrollArea } from "@dust-tt/sparkle";

interface PodAppListProps {
  apps: PodApp[];
  selectedPrefix: string | null;
  onSelect: (prefix: string) => void;
  iconByFramePath: Map<string, CustomResourceIconType>;
  defaultIcon: CustomResourceIconType;
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

function appSummary(app: PodApp): string {
  const parts = [
    `${app.functions.length} ${app.functions.length === 1 ? "function" : "functions"}`,
  ];
  if (app.databases.length > 0) {
    parts.push(
      `${app.databases.length} ${app.databases.length === 1 ? "db" : "dbs"}`
    );
  }

  return parts.join(" · ");
}

export function PodAppList({
  apps,
  selectedPrefix,
  onSelect,
  iconByFramePath,
  defaultIcon,
}: PodAppListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col">
        {apps.map((app) => {
          const isSelected = app.prefix === selectedPrefix;

          return (
            <button
              key={app.prefix}
              type="button"
              onClick={() => onSelect(app.prefix)}
              className={cn(
                "flex flex-col gap-1 border-b border-border px-4 py-3 text-left",
                "hover:bg-muted-background dark:border-border-night",
                "dark:hover:bg-muted-background-night",
                isSelected &&
                  "bg-muted-background dark:bg-muted-background-night"
              )}
            >
              <div className="flex items-center gap-2">
                <Icon
                  visual={getIcon(appIcon(app, iconByFramePath, defaultIcon))}
                  size="sm"
                />
                <span className="grow truncate copy-sm font-semibold">
                  {app.name ?? "Unfiled"}
                </span>
                {app.functions.length === 0 && app.databases.length === 0 && (
                  <Chip size="xs" color="primary" label="Draft" />
                )}
              </div>
              <span className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
                {appSummary(app)}
              </span>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
