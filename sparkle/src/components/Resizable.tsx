import { cn } from "@sparkle/lib/utils";
import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

type ResizablePanelGroupProps = React.ComponentProps<
  typeof ResizablePrimitive.PanelGroup
>;

const ResizablePanelGroupContext = React.createContext<{
  direction: ResizablePanelGroupProps["direction"];
  isDragging: boolean;
  panelGroupSizePx?: number;
  setIsDragging: (isDragging: boolean) => void;
} | null>(null);

type ResizablePanelGroupRef = React.ElementRef<
  typeof ResizablePrimitive.PanelGroup
>;

const ResizablePanelGroup: React.ForwardRefExoticComponent<
  ResizablePanelGroupProps & React.RefAttributes<ResizablePanelGroupRef>
> = React.forwardRef<ResizablePanelGroupRef, ResizablePanelGroupProps>(
  ({ className, direction, id, ...props }, forwardedRef) => {
    const panelGroupRef = React.useRef<ResizablePanelGroupRef | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [panelGroupElement, setPanelGroupElement] =
      React.useState<HTMLElement | null>(null);
    const [panelGroupSizePx, setPanelGroupSizePx] = React.useState<
      number | undefined
    >();

    const setPanelGroupRef = React.useCallback(
      (node: ResizablePanelGroupRef | null) => {
        panelGroupRef.current = node;

        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const updatePanelGroupSize = React.useCallback(() => {
      if (!panelGroupElement) {
        setPanelGroupSizePx(undefined);
        return;
      }

      const nextSize =
        direction === "vertical"
          ? panelGroupElement.clientHeight
          : panelGroupElement.clientWidth;

      setPanelGroupSizePx((previousSize) =>
        previousSize === nextSize ? previousSize : nextSize
      );
    }, [direction, panelGroupElement]);

    React.useLayoutEffect(() => {
      const panelGroupId = panelGroupRef.current?.getId();

      setPanelGroupElement(
        panelGroupId
          ? ResizablePrimitive.getPanelGroupElement(panelGroupId)
          : null
      );
    }, []);

    React.useLayoutEffect(() => {
      updatePanelGroupSize();
    }, [updatePanelGroupSize]);

    React.useEffect(() => {
      if (!panelGroupElement || typeof ResizeObserver === "undefined") {
        return;
      }

      const resizeObserver = new ResizeObserver(updatePanelGroupSize);

      resizeObserver.observe(panelGroupElement);

      return () => {
        resizeObserver.disconnect();
      };
    }, [panelGroupElement, updatePanelGroupSize]);

    const contextValue = React.useMemo(
      () => ({
        direction,
        isDragging,
        panelGroupSizePx,
        setIsDragging,
      }),
      [direction, isDragging, panelGroupSizePx]
    );

    return (
      <ResizablePanelGroupContext.Provider value={contextValue}>
        <ResizablePrimitive.PanelGroup
          ref={setPanelGroupRef}
          id={id}
          direction={direction}
          className={cn(
            "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
            className
          )}
          {...props}
        />
      </ResizablePanelGroupContext.Provider>
    );
  }
);
ResizablePanelGroup.displayName = "ResizablePanelGroup";

interface ResizablePanelContentProps {
  children: React.ReactNode;
  panelSize?: number;
}

const ResizablePanelContent = ({
  children,
  panelSize,
}: ResizablePanelContentProps) => {
  const panelGroupContext = React.useContext(ResizablePanelGroupContext);

  const panelSizeStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!panelGroupContext?.panelGroupSizePx || !panelSize) {
      return undefined;
    }

    const nextSize = Math.round(
      (panelGroupContext.panelGroupSizePx * panelSize) / 100
    );

    if (nextSize <= 0) {
      return undefined;
    }

    return panelGroupContext.direction === "vertical"
      ? { height: nextSize }
      : { width: nextSize };
  }, [
    panelGroupContext?.direction,
    panelGroupContext?.panelGroupSizePx,
    panelSize,
  ]);

  return (
    <div className="h-full w-full" style={panelSizeStyle}>
      {children}
    </div>
  );
};

type ResizablePanelRef = React.ElementRef<typeof ResizablePrimitive.Panel>;
type ResizablePanelProps = React.ComponentProps<
  typeof ResizablePrimitive.Panel
> & {
  animated?: boolean;
  /**
   * Keeps content laid out at the expanded panel size while an animated panel
   * opens or collapses. Manual handle dragging still resizes content live.
   */
  stableContent?: boolean;
  /** Target panel size, as a percentage of the panel group. */
  stableContentSize?: number;
};

const ResizablePanel = React.forwardRef<ResizablePanelRef, ResizablePanelProps>(
  (
    {
      animated = false,
      children,
      className,
      defaultSize,
      onExpand,
      onResize,
      stableContent = false,
      stableContentSize,
      ...props
    },
    forwardedRef
  ) => {
    const panelGroupContext = React.useContext(ResizablePanelGroupContext);
    const panelRef = React.useRef<ResizablePanelRef | null>(null);
    const fallbackContentPanelSize =
      stableContentSize ??
      (typeof defaultSize === "number" && defaultSize > 0
        ? defaultSize
        : undefined);
    const [lastStablePanelSize, setLastStablePanelSize] = React.useState<
      number | undefined
    >();
    const contentPanelSize = lastStablePanelSize ?? fallbackContentPanelSize;

    const updateStablePanelSize = React.useCallback(
      (panelSize: number | undefined) => {
        if (!stableContent || !panelSize || panelSize <= 0) {
          return;
        }

        setLastStablePanelSize(panelSize);
      },
      [stableContent]
    );

    const setPanelRef = React.useCallback(
      (node: ResizablePanelRef | null) => {
        panelRef.current = node;

        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const handleResize: NonNullable<
      React.ComponentProps<typeof ResizablePrimitive.Panel>["onResize"]
    > = (size, previousSize) => {
      updateStablePanelSize(size);
      onResize?.(size, previousSize);
    };

    const handleExpand: NonNullable<
      React.ComponentProps<typeof ResizablePrimitive.Panel>["onExpand"]
    > = () => {
      updateStablePanelSize(
        lastStablePanelSize ?? stableContentSize ?? panelRef.current?.getSize()
      );
      onExpand?.();
    };

    return (
      <ResizablePrimitive.Panel
        ref={setPanelRef}
        defaultSize={defaultSize}
        onExpand={handleExpand}
        onResize={handleResize}
        className={cn(
          animated && "motion-reduce:transition-none",
          animated &&
            !panelGroupContext?.isDragging &&
            "transition-[flex-grow,flex-basis] duration-300 ease-out-quint",
          className
        )}
        {...props}
      >
        {stableContent ? (
          <ResizablePanelContent panelSize={contentPanelSize}>
            {children}
          </ResizablePanelContent>
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
  onDragging,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => {
  const panelGroupContext = React.useContext(ResizablePanelGroupContext);

  const handleDragging = (isDragging: boolean) => {
    panelGroupContext?.setIsDragging(isDragging);
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
