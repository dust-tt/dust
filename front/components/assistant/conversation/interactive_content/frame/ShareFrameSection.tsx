import type { ReactElement, ReactNode } from "react";

interface SectionProps {
  label: ReactElement | string;
  description?: ReactElement | string;
  action?: ReactElement;
  children: ReactNode;
}

export function Section({
  label,
  description,
  action,
  children,
}: SectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2">
          <h3 className="label-sm text-foreground">{label}</h3>
          {action}
        </div>
        {description && (
          <p className="px-2 copy-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
