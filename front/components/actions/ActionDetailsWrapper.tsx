import { Avatar, cn, CollapsibleComponent, Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ActionDetailsWrapperProps {
  actionName: string;
  children: React.ReactNode;
  defaultOpen: boolean;
  collapsible?: boolean;
  visual: ComponentType<{ className?: string }>;
}

export function ActionDetailsWrapper({
  actionName,
  children,
  defaultOpen,
  collapsible = true,
  visual,
}: ActionDetailsWrapperProps) {
  if (!collapsible) {
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

  return (
    <CollapsibleComponent
      rootProps={{ defaultOpen }}
      triggerProps={{}}
      triggerChildren={
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
      }
      contentChildren={children}
    />
  );
}
