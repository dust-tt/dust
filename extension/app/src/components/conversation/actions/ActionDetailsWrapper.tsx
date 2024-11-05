import { Collapsible, Icon } from "@dust-tt/sparkle";
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
        <div className="flex flex-row items-center gap-x-2">
          <Icon className="text-brand" size="xs" visual={visual} />
          <span className="text-sm font-bold text-element-900">
            {actionName}
          </span>
        </div>
      </Collapsible.Button>
      <Collapsible.Panel>{children}</Collapsible.Panel>
    </Collapsible>
  );
}
