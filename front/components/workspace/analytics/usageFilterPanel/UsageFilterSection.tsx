import type { ReactNode } from "react";

interface UsageFilterSectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function UsageFilterSection({
  title,
  action,
  children,
}: UsageFilterSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
        <span className="min-w-0 truncate">{title}</span>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
