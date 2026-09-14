import { cn, Icon } from "@dust-tt/sparkle";
import type { ComponentType, ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Optional icon shown above the title. */
  icon?: ComponentType<{ className?: string }>;
  /** Optional call to action rendered below the description. */
  action?: ReactNode;
  className?: string;
}

/**
 * Shared empty-state block used across surfaces (Inbox, Pods, ...). Renders an
 * optional icon, a title, an optional description, and an optional action.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-2 text-center",
        className
      )}
    >
      <div className="flex flex-col items-center justify-center gap-0 text-foreground">
        {icon && <Icon size="md" visual={icon} />}
        <h2 className="text-xl">{title}</h2>
      </div>
      {description && (
        <p className="text-center text-base text-faint">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
