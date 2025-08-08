import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import React, { useState } from "react";

interface AgentBuilderSectionContainerProps {
  title: string;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function AgentBuilderSectionContainer({
  title,
  description,
  headerActions,
  children,
  collapsible = false,
  defaultOpen = true,
}: AgentBuilderSectionContainerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const header = (
    <div
      className={`flex flex-col items-end justify-between gap-2 sm:flex-row`}
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
  );

  if (collapsible) {
    return (
      <section className="px-6">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger
            isOpen={isOpen}
            className="w-full cursor-pointer border-0 bg-transparent p-0 hover:bg-transparent focus:outline-none"
          >
            {header}
          </CollapsibleTrigger>
          <CollapsibleContent>{children}</CollapsibleContent>
        </Collapsible>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 px-6">
      {header}
      {children}
    </section>
  );
}
