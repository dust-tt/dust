import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

import { Icon } from "@sparkle/components/";
import { GrabIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "s-flex s-h-full s-w-full data-[panel-group-direction=vertical]:s-flex-col",
      className
    )}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "focus-visible:s-ring-ring s-relative s-flex s-w-px s-items-center s-justify-center s-bg-border after:s-absolute after:s-inset-y-0 after:s-left-1/2 after:s-w-1 after:s--translate-x-1/2 focus-visible:s-outline-none focus-visible:s-ring-1 focus-visible:s-ring-offset-1 data-[panel-group-direction=vertical]:s-h-px data-[panel-group-direction=vertical]:s-w-full data-[panel-group-direction=vertical]:after:s-left-0 data-[panel-group-direction=vertical]:after:s-h-1 data-[panel-group-direction=vertical]:after:s-w-full data-[panel-group-direction=vertical]:after:s--translate-y-1/2 data-[panel-group-direction=vertical]:after:s-translate-x-0 [&[data-panel-group-direction=vertical]>div]:s-rotate-90",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="s-z-10 s-flex s-h-4 s-w-3 s-items-center s-justify-center s-rounded-sm s-border s-bg-border">
        <Icon visual={GrabIcon} size="xs" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
