import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

interface SettingsListProps {
  children: ReactNode;
  className?: string;
}

export function SettingsList({ children, className }: SettingsListProps) {
  return (
    <div
      className={cn(
        "s-flex s-flex-col s-overflow-hidden s-rounded-2xl s-border s-border-border s-divide-y s-divide-border dark:s-border-border-night dark:s-divide-border-night",
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
  action?: ReactNode;
  className?: string;
}

function SettingsListRow({
  title,
  description,
  action,
  className,
}: SettingsListRowProps) {
  return (
    <div
      className={cn(
        "s-flex s-items-center s-justify-between s-gap-4 s-px-4 s-py-4",
        className
      )}
    >
      <div className="s-flex s-min-w-0 s-flex-col s-gap-0.5">
        <span className="s-heading-sm s-text-foreground dark:s-text-foreground-night">
          {title}
        </span>
        {description && (
          <span className="s-copy-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
            {description}
          </span>
        )}
      </div>
      {action && <div className="s-shrink-0">{action}</div>}
    </div>
  );
}

SettingsList.Row = SettingsListRow;

export type { SettingsListProps, SettingsListRowProps };
