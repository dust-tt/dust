import { cn } from "@sparkle/lib/utils";
import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

type ResizablePanelGroupProps = React.ComponentProps<
  typeof ResizablePrimitive.PanelGroup
>;

const ResizablePanelGroup: React.FC<ResizablePanelGroupProps> = ({
  className,
  ...props
}) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "s:flex s:h-full s:w-full s:data-[panel-group-direction=vertical]:flex-col",
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
      "s:relative s:flex s:w-px s:items-center s:justify-center",
      "s:after:absolute s:after:inset-y-0 s:after:left-1/2 s:after:w-1 s:after:-translate-x-1/2",
      "s:focus-visible:outline-hidden s:focus-visible:ring-1",
      "s:focus-visible:ring-ring s:dark:focus-visible:ring-ring-night",
      "s:focus-visible:ring-offset-1 s:data-[panel-group-direction=vertical]:h-px",
      "s:data-[panel-group-direction=vertical]:w-full",
      "s:data-[panel-group-direction=vertical]:after:left-0",
      "s:data-[panel-group-direction=vertical]:after:h-1",
      "s:data-[panel-group-direction=vertical]:after:w-full",
      "s:data-[panel-group-direction=vertical]:after:-translate-y-1/2",
      "s:data-[panel-group-direction=vertical]:after:translate-x-0",
      "s:[&[data-panel-group-direction=vertical]>div]:rotate-90",
      "s:bg-gray-100 s:dark:bg-border-night",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div
        className={cn(
          "s:absolute s:flex s:h-6 s:w-2 s:items-center s:justify-center s:rounded-2xl",
          "s:border s:border-gray-100 s:bg-background s:dark:bg-background-night"
        )}
      >
        <div className="s:w-px" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
