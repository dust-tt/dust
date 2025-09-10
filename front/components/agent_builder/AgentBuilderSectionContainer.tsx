import type { ReactNode } from "react";
import React from "react";

interface AgentBuilderSectionContainerProps {
  title: string;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function AgentBuilderSectionContainer({
  title,
  description,
  headerActions,
  children,
}: AgentBuilderSectionContainerProps) {
  return (
    <section className="flex flex-col gap-3 px-6">
      <div className="flex flex-col items-end justify-between gap-2 sm:flex-row">
        <div>
          <h2 className="heading-lg text-foreground dark:text-foreground-night">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {description}
            </p>
          )}
        </div>
        {headerActions && (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <div className="flex items-center gap-2">{headerActions}</div>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
