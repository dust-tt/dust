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
        "flex items-center justify-between gap-4 px-4 py-4",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
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
