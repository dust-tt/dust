import type { ActionDetailsDisplayContext } from "@app/components/actions/mcp/details/types";
import { cn, Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ActionDetailsWrapperProps {
  actionName: string;
  children?: React.ReactNode;
  displayContext: ActionDetailsDisplayContext;
  headerAction?: React.ReactNode;
  visual: ComponentType<{ className?: string }>;
}

export function ActionDetailsWrapper({
  actionName,
  children,
  displayContext,
  headerAction,
  visual,
}: ActionDetailsWrapperProps) {
  if (displayContext === "conversation") {
    return <>{children}</>;
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
        <span className="flex-grow"></span>
        {headerAction}
      </div>
      {children}
    </div>
  );
}
