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
      <div className="flex items-center text-sm font-medium text-muted-foreground">
        <span className="min-w-0 flex-1 truncate px-2 py-1.5">{title}</span>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
