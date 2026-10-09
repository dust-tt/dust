import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

interface SettingsListProps {
  children: ReactNode;
  className?: string;
  /** Vertical row padding: comfortable (16px, default) or compact (12px). */
  density?: "comfortable" | "compact";
}

/**
 * A vertically stacked list of settings, where each `SettingsList.Row` pairs a `title`
 * and optional `description` with a trailing `action` control; the container handles
 * dividers and spacing. Use it for a settings or preferences panel where each row exposes
 * a single labelled control. For list rows that need a leading visual or hover-revealed
 * controls, use `ContextItem` instead.
 *
 * @summary Stacked list of settings rows.
 */
export function SettingsList({
  children,
  className,
  density = "comfortable",
}: SettingsListProps) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border divide-y divide-border",
        density === "compact"
          ? "[--settings-list-row-padding:0.75rem]"
          : "[--settings-list-row-padding:1rem]",
        className
      )}
    >
      {children}
    </div>
  );
}

interface SettingsListRowProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing control for the row, e.g. a `SliderToggle` or `Input`. */
  action?: ReactNode;
  className?: string;
}

function SettingsListRow({
  icon,
  title,
  description,
  action,
  className,
}: SettingsListRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-[var(--settings-list-row-padding,1rem)]",
        className
      )}
    >
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex min-w-0 flex-col gap-0.5 grow-1">
        <span className="heading-sm text-foreground">{title}</span>
        {description && (
          <span className="copy-sm text-muted-foreground">{description}</span>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

SettingsList.Row = SettingsListRow;

export type { SettingsListProps, SettingsListRowProps };
