import { cn } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface UsageSettingRowProps {
  title: string;
  description: string;
  action: ReactNode;
  isFirst?: boolean;
}

export function UsageSettingRow({
  title,
  description,
  action,
  isFirst,
}: UsageSettingRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-4",
        !isFirst && "border-t border-border dark:border-border-night"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="heading-sm text-foreground dark:text-foreground-night">
          {title}
        </span>
        <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </span>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
