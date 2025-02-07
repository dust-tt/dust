import { classNames, Collapsible, Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ActionDetailsWrapperProps {
  actionName: string;
  children: React.ReactNode;
  defaultOpen: boolean;
  visual: ComponentType<{ className?: string }>;
}

export function ActionDetailsWrapper({
  actionName,
  children,
  defaultOpen,
  visual,
}: ActionDetailsWrapperProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Collapsible.Button>
        <div
          className={classNames(
            "text-foreground dark:text-foreground-night",
            "flex flex-row items-center gap-x-2"
          )}
        >
          <Icon size="sm" visual={visual} />
          <span className="text-base font-semibold">{actionName}</span>
        </div>
      </Collapsible.Button>
      <Collapsible.Panel>{children}</Collapsible.Panel>
    </Collapsible>
  );
}
