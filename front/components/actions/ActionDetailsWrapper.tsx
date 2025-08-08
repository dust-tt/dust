import { Avatar, cn, CollapsibleComponent, Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ActionDetailsWrapperProps {
  actionName: string;
  children: React.ReactNode;
  visual: ComponentType<{ className?: string }>;
}

export function ActionDetailsWrapper({
  actionName,
  children,
  visual,
}: ActionDetailsWrapperProps) {
  return (
    <div>
      <div
        className={cn(
          "text-foreground dark:text-foreground-night",
          "flex flex-row items-center gap-x-2"
        )}
      >
        <Avatar
          size="sm"
          visual={<Icon visual={visual} />}
          backgroundColor="bg-muted-background dark:bg-muted-background-night"
        />
        <span className="heading-base">{actionName}</span>
      </div>
      {children}
    </div>
  );
}
