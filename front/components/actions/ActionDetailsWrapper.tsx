import {
  Avatar,
  cn,
  CollapsibleComponent,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ActionDetailsWrapperProps {
  actionName: string;
  children: React.ReactNode;
  defaultOpen: boolean;
  viewType?: "conversation" | "sidebar";
  visual: ComponentType<{ className?: string }>;
}

export function ActionDetailsWrapper({
  actionName,
  children,
  defaultOpen,
  viewType = "sidebar",
  visual,
}: ActionDetailsWrapperProps) {
  if (viewType === "conversation") {
    return (
      <div className="flex w-full flex-col gap-y-2 px-2 py-1">
        <div
          className={cn(
            "text-foreground dark:text-foreground-night",
            "flex flex-grow flex-row items-center gap-x-2"
          )}
        >
          <Avatar
            size="sm"
            visual={<Icon visual={visual} />}
            backgroundColor="bg-muted-background dark:bg-muted-background-night"
          />
          <span className="heading-base">{actionName}</span>
          <span className="flex-grow"></span>
          <div className="self-start">
            <Spinner size="xs" />
          </div>
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
