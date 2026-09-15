import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

interface SettingsListProps {
  children: ReactNode;
  className?: string;
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
export function SettingsList({ children, className }: SettingsListProps) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border divide-y divide-border",
        className
      )}
    >
      {children}
    </div>
  );
}

interface SettingsListRowProps {
  title: ReactNode;
  description?: ReactNode;
  /** Trailing control for the row, e.g. a `SliderToggle` or `Input`. */
  action?: ReactNode;
  /** Full-width control rendered below the title line, for controls too wide for `action` (e.g. `OptionTileGroup`). */
  children?: ReactNode;
  className?: string;
}

function SettingsListRow({
  title,
  description,
  action,
  children,
  className,
}: SettingsListRowProps) {
  return (
    <div className={cn("flex flex-col gap-4 px-4 py-4", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="heading-sm text-foreground">{title}</span>
          {description && (
            <span className="copy-sm text-muted-foreground">{description}</span>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

SettingsList.Row = SettingsListRow;

export type { SettingsListProps, SettingsListRowProps };
