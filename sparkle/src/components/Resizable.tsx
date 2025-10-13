import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

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
      "s-relative s-flex s-w-px s-items-center s-justify-center",
      "after:s-absolute after:s-inset-y-0 after:s-left-1/2 after:s-w-1 after:s--translate-x-1/2",
      "focus-visible:s-outline-none focus-visible:s-ring-1",
      "focus-visible:s-ring-ring dark:focus-visible:s-ring-ring-night",
      "focus-visible:s-ring-offset-1 data-[panel-group-direction=vertical]:s-h-px",
      "data-[panel-group-direction=vertical]:s-w-full",
      "data-[panel-group-direction=vertical]:after:s-left-0",
      "data-[panel-group-direction=vertical]:after:s-h-1",
      "data-[panel-group-direction=vertical]:after:s-w-full",
      "data-[panel-group-direction=vertical]:after:s--translate-y-1/2",
      "data-[panel-group-direction=vertical]:after:s-translate-x-0",
      "[&[data-panel-group-direction=vertical]>div]:s-rotate-90",
      "s-bg-gray-100 dark:s-bg-border-night",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div
        className={cn(
          "s-absolute s-flex s-h-6 s-w-2 s-items-center s-justify-center s-rounded-2xl",
          "s-border s-border-gray-100 s-bg-background dark:s-bg-background-night"
        )}
      >
        <div className="s-w-px" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
