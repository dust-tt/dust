import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

interface SettingsListProps {
  children: ReactNode;
  className?: string;
}

export function SettingsList({ children, className }: SettingsListProps) {
  const normalizedChildren = React.Children.toArray(children);

  return (
    <div
      className={cn(
        "s-flex s-flex-col s-rounded-2xl s-border s-border-border dark:s-border-border-night",
        className
      )}
    >
      {normalizedChildren.map((child, index) => {
        if (!React.isValidElement(child)) {
          return child;
        }
        // Inject `isFirst` so the row knows to skip its top divider. Children
        // can still override by passing `isFirst` explicitly.
        return React.cloneElement(
          child as React.ReactElement<SettingsListRowProps>,
          {
            isFirst: child.props.isFirst ?? index === 0,
          }
        );
      })}
    </div>
  );
}

interface SettingsListRowProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  isFirst?: boolean;
  className?: string;
}

function SettingsListRow({
  title,
  description,
  action,
  isFirst,
  className,
}: SettingsListRowProps) {
  return (
    <div
      className={cn(
        "s-flex s-items-center s-justify-between s-gap-4 s-px-4 s-py-4",
        !isFirst && "s-border-t s-border-border dark:s-border-border-night",
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
