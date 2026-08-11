import { cn } from "@sparkle/lib/utils";
import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

type ResizablePanelGroupProps = React.ComponentProps<
  typeof ResizablePrimitive.PanelGroup
> & {
  /**
   * Animates panel layout changes while keeping pointer dragging immediate.
   */
  animateLayoutChanges?: boolean;
};

const ResizablePanelGroup: React.FC<ResizablePanelGroupProps> = ({
  animateLayoutChanges = false,
  className,
  ...props
}) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      animateLayoutChanges && [
        "[&>[data-panel]]:transition-[flex-grow]",
        "[&:has(>[data-resize-handle-state=drag])>[data-panel]]:transition-none",
        "[&>[data-panel]]:duration-300",
        "[&>[data-panel]]:ease-out-quint",
      ],
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
      "relative flex w-px items-center justify-center",
      "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
      "focus-visible:outline-hidden focus-visible:ring-1",
      "focus-visible:ring-ring",
      "focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px",
      "data-[panel-group-direction=vertical]:w-full",
      "data-[panel-group-direction=vertical]:after:left-0",
      "data-[panel-group-direction=vertical]:after:h-1",
      "data-[panel-group-direction=vertical]:after:w-full",
      "data-[panel-group-direction=vertical]:after:-translate-y-1/2",
      "data-[panel-group-direction=vertical]:after:translate-x-0",
      "[&[data-panel-group-direction=vertical]>div]:rotate-90",
      "bg-primary-100",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div
        className={cn(
          "absolute flex h-6 w-2 items-center justify-center rounded-2xl",
          "border border-border bg-background"
        )}
      >
        <div className="w-px" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
