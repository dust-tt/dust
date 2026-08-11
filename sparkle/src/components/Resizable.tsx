import { cn } from "@sparkle/lib/utils";
import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

type ResizablePanelGroupProps = React.ComponentProps<
  typeof ResizablePrimitive.PanelGroup
> & {
  /**
   * Animates panel layout changes while keeping pointer dragging immediate.
   * Fully collapsed panels keep their content layout during the transition.
   */
  animateLayoutChanges?: boolean;
};

const ResizablePanelGroupContext = React.createContext<{
  direction: ResizablePanelGroupProps["direction"];
  panelGroupSizePx?: number;
} | null>(null);

const ResizablePanelGroup = ({
  animateLayoutChanges = false,
  className,
  direction,
  id,
  ...props
}: ResizablePanelGroupProps) => {
  const panelGroupRef =
    React.useRef<React.ElementRef<typeof ResizablePrimitive.PanelGroup>>(null);
  const [panelGroupSizePx, setPanelGroupSizePx] = React.useState<
    number | undefined
  >();

  // Measure before paint so preserved content starts at its stable size.
  React.useLayoutEffect(() => {
    if (!animateLayoutChanges) {
      return;
    }

    const panelGroupId = id ?? panelGroupRef.current?.getId();
    const panelGroupElement = panelGroupId
      ? ResizablePrimitive.getPanelGroupElement(panelGroupId)
      : null;

    if (!panelGroupElement) {
      setPanelGroupSizePx(undefined);
      return;
    }

    const updatePanelGroupSize = () => {
      const nextSize =
        direction === "vertical"
          ? panelGroupElement.clientHeight
          : panelGroupElement.clientWidth;

      setPanelGroupSizePx(nextSize);
    };

    updatePanelGroupSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updatePanelGroupSize);

    resizeObserver.observe(panelGroupElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [animateLayoutChanges, direction, id]);

  const contextValue = animateLayoutChanges
    ? { direction, panelGroupSizePx }
    : null;
  const animatedPanelClasses = animateLayoutChanges && [
    "[&:not(:has(>[data-resize-handle-state=drag]))>[data-panel]]:transition-[flex-grow]",
    "[&>[data-panel]]:duration-300 [&>[data-panel]]:ease-out-quint",
  ];

  return (
    <ResizablePanelGroupContext.Provider value={contextValue}>
      <ResizablePrimitive.PanelGroup
        ref={panelGroupRef}
        id={id}
        direction={direction}
        className={cn(
          "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
          animatedPanelClasses,
          className
        )}
        {...props}
      />
    </ResizablePanelGroupContext.Provider>
  );
};

const ResizablePanel = React.forwardRef<
  React.ElementRef<typeof ResizablePrimitive.Panel>,
  React.ComponentProps<typeof ResizablePrimitive.Panel>
>(
  (
    { children, collapsedSize, collapsible, defaultSize, onResize, ...props },
    forwardedRef
  ) => {
    const panelGroupContext = React.useContext(ResizablePanelGroupContext);
    const preserveContentLayout =
      panelGroupContext !== null &&
      collapsible === true &&
      (collapsedSize ?? 0) === 0;
    const fallbackContentPanelSize =
      typeof defaultSize === "number" && defaultSize > 0
        ? defaultSize
        : undefined;
    const [lastNonZeroPanelSize, setLastNonZeroPanelSize] = React.useState<
      number | undefined
    >();
    const contentPanelSize = lastNonZeroPanelSize ?? fallbackContentPanelSize;
    const contentSizePx =
      panelGroupContext?.panelGroupSizePx && contentPanelSize
        ? Math.round(
            (panelGroupContext.panelGroupSizePx * contentPanelSize) / 100
          )
        : undefined;
    let contentStyle: React.CSSProperties | undefined;

    if (contentSizePx && contentSizePx > 0) {
      contentStyle =
        panelGroupContext?.direction === "vertical"
          ? { height: contentSizePx }
          : { width: contentSizePx };
    }

    const handleResize: NonNullable<
      React.ComponentProps<typeof ResizablePrimitive.Panel>["onResize"]
    > = (size, previousSize) => {
      if (preserveContentLayout && size > 0) {
        setLastNonZeroPanelSize(size);
      }

      onResize?.(size, previousSize);
    };

    return (
      <ResizablePrimitive.Panel
        ref={forwardedRef}
        collapsedSize={collapsedSize}
        collapsible={collapsible}
        defaultSize={defaultSize}
        onResize={preserveContentLayout ? handleResize : onResize}
        {...props}
      >
        {preserveContentLayout ? (
          <div className="h-full w-full" style={contentStyle}>
            {children}
          </div>
        ) : (
          children
        )}
      </ResizablePrimitive.Panel>
    );
  }
);
ResizablePanel.displayName = "ResizablePanel";

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
