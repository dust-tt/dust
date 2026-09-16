import type { ReactNode } from "react";

interface SectionProps {
  label: ReactNode;
  // Optional subtitle rendered under the label, tightly grouped with it.
  description?: ReactNode;
  // Optional trailing element aligned to the right of the label row.
  action?: ReactNode;
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
