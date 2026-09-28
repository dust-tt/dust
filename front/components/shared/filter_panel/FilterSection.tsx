import type { ReactNode } from "react";

interface FilterSectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function FilterSection({ title, action, children }: FilterSectionProps) {
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
