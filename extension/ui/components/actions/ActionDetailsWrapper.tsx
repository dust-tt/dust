import { cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ActionDetailsWrapperProps {
  actionName: string;
  children: React.ReactNode;
  viewType: "conversation" | "sidebar";
  visual: ComponentType<{ className?: string }>;
}

export function ActionDetailsWrapper({
  actionName,
  children,
  viewType,
  visual,
}: ActionDetailsWrapperProps) {
  if (viewType === "conversation") {
    return (
      <div className="flex w-full flex-col gap-y-2">
        <div
          className={cn(
            "text-foreground dark:text-foreground-night",
            "flex flex-grow flex-row items-center gap-x-2"
          )}
        >
          <Icon visual={visual} size="xs" />
          <span className="heading-sm font-medium">{actionName}</span>
          <span className="flex-grow"></span>
          {/* TODO: Align spinner with CoT spinner: <div className="self-start"> */}
          <div>
            <Spinner size="xs" />
          </div>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "text-foreground dark:text-foreground-night",
          "flex flex-row items-center gap-x-2"
        )}
      >
        <Icon visual={visual} />
        <span className="heading-base">{actionName}</span>
      </div>
      {children}
    </div>
  );
}
