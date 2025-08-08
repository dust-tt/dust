import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Page,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import React, { useState } from "react";

interface AgentBuilderSectionContainerProps {
  title: string;
  description?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function AgentBuilderSectionContainer({
  title,
  description,
  headerActions,
  children,
  className = "",
  collapsible = false,
  defaultOpen = true,
}: AgentBuilderSectionContainerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (collapsible) {
    return (
      <>
        <div className={`flex flex-col ${className}`}>
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger
              isOpen={isOpen}
              className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 hover:bg-transparent focus:outline-none"
            >
              <h2 className="heading-lg text-foreground dark:text-foreground-night">
                {title}
              </h2>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-col gap-4 px-1 pt-4">{children}</div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </>
    );
  }

  return (
    <section className="px-6">
      <div
        className={`flex flex-col items-end justify-between gap-2 sm:flex-row ${className} mb-3`}
      >
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
