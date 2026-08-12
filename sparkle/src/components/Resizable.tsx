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

const ResizablePanelAnimationContext = React.createContext<{
  isDragging: boolean;
  setIsDragging: (isDragging: boolean) => void;
} | null>(null);

const ResizablePanelGroup: React.FC<ResizablePanelGroupProps> = ({
  animateLayoutChanges = false,
  className,
  ...props
}) => {
  const [isDragging, setIsDragging] = React.useState(false);

  return (
    <ResizablePanelAnimationContext.Provider
      value={animateLayoutChanges ? { isDragging, setIsDragging } : null}
    >
      <ResizablePrimitive.PanelGroup
        className={cn(
          "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
          className
        )}
        {...props}
      />
    </ResizablePanelAnimationContext.Provider>
  );
};

const ResizablePanel = React.forwardRef<
  React.ElementRef<typeof ResizablePrimitive.Panel>,
  React.ComponentPropsWithoutRef<typeof ResizablePrimitive.Panel>
>(({ className, ...props }, ref) => {
  const animationContext = React.useContext(ResizablePanelAnimationContext);

  return (
    <ResizablePrimitive.Panel
      ref={ref}
      className={cn(
        className,
        animationContext &&
          (animationContext.isDragging
            ? "transition-none"
            : "transition-[flex-grow] duration-300 ease-out-quint")
      )}
      {...props}
    />
  );
});
ResizablePanel.displayName = "ResizablePanel";

const ResizableHandle = ({
  withHandle,
  className,
  onDragging,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => {
  const animationContext = React.useContext(ResizablePanelAnimationContext);

  const handleDragging = (isDragging: boolean) => {
    animationContext?.setIsDragging(isDragging);
    onDragging?.(isDragging);
  };

  return (
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
      onDragging={handleDragging}
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
};

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
