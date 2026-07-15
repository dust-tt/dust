import { cn } from "@sparkle/lib/utils";
import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

type ResizablePanelGroupProps = React.ComponentProps<
  typeof ResizablePrimitive.PanelGroup
> & {
  /**
   * Animates programmatic panel layout changes while keeping direct pointer
   * and keyboard resizing immediate. Reduced-motion preferences are respected
   * automatically.
   */
  animateLayoutChanges?: boolean;
};

const ResizablePanelGroupContext = React.createContext<{
  animateLayoutChanges: boolean;
  direction: ResizablePanelGroupProps["direction"];
  isResizing: boolean;
  panelGroupSizePx?: number;
  setIsDragging: (isDragging: boolean) => void;
  setIsKeyboardResizing: (isKeyboardResizing: boolean) => void;
} | null>(null);

type ResizablePanelGroupRef = React.ElementRef<
  typeof ResizablePrimitive.PanelGroup
>;

const ResizablePanelGroup: React.ForwardRefExoticComponent<
  ResizablePanelGroupProps & React.RefAttributes<ResizablePanelGroupRef>
> = React.forwardRef<ResizablePanelGroupRef, ResizablePanelGroupProps>(
  (
    { animateLayoutChanges = false, className, direction, id, ...props },
    forwardedRef
  ) => {
    const panelGroupRef = React.useRef<ResizablePanelGroupRef | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isKeyboardResizing, setIsKeyboardResizing] = React.useState(false);
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

    React.useLayoutEffect(() => {
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

        setPanelGroupSizePx((previousSize) =>
          previousSize === nextSize ? previousSize : nextSize
        );
      };

      updatePanelGroupSize();

      if (typeof ResizeObserver === "undefined") {
        return;
      }

      const resizeObserver = new ResizeObserver(() => updatePanelGroupSize());

      resizeObserver.observe(panelGroupElement);

      return () => {
        resizeObserver.disconnect();
      };
    }, [direction, id]);

    const contextValue = React.useMemo(
      () => ({
        animateLayoutChanges,
        direction,
        isResizing: isDragging || isKeyboardResizing,
        panelGroupSizePx,
        setIsDragging,
        setIsKeyboardResizing,
      }),
      [
        animateLayoutChanges,
        direction,
        isDragging,
        isKeyboardResizing,
        panelGroupSizePx,
      ]
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
  const contentSizePx =
    panelGroupContext?.panelGroupSizePx && panelSize
      ? Math.round((panelGroupContext.panelGroupSizePx * panelSize) / 100)
      : undefined;
  let panelSizeStyle: React.CSSProperties | undefined;

  if (contentSizePx && contentSizePx > 0) {
    panelSizeStyle =
      panelGroupContext?.direction === "vertical"
        ? { height: contentSizePx }
        : { width: contentSizePx };
  }

  return (
    <div className="h-full w-full" style={panelSizeStyle}>
      {children}
    </div>
  );
};

type ResizablePanelProps = React.ComponentProps<
  typeof ResizablePrimitive.Panel
> & {
  /**
   * Keeps content laid out at the latest non-zero target size while a panel
   * fully collapses to zero or expands. Direct resizing still updates live.
   * Compact collapsed states require their own content lifecycle.
   */
  preserveContentLayout?: boolean;
  /**
   * Initial content size, as a percentage of the panel group, used until the
   * panel reports a non-zero size.
   */
  initialContentSize?: number;
};

const ResizablePanel = React.forwardRef<
  React.ElementRef<typeof ResizablePrimitive.Panel>,
  ResizablePanelProps
>(
  (
    {
      children,
      className,
      defaultSize,
      initialContentSize,
      onResize,
      preserveContentLayout = false,
      ...props
    },
    forwardedRef
  ) => {
    const panelGroupContext = React.useContext(ResizablePanelGroupContext);
    const fallbackContentPanelSize =
      initialContentSize ??
      (typeof defaultSize === "number" && defaultSize > 0
        ? defaultSize
        : undefined);
    const [lastNonZeroPanelSize, setLastNonZeroPanelSize] = React.useState<
      number | undefined
    >();
    const contentPanelSize = lastNonZeroPanelSize ?? fallbackContentPanelSize;

    const updateContentPanelSize = (panelSize: number | undefined) => {
      if (!preserveContentLayout || !panelSize || panelSize <= 0) {
        return;
      }

      setLastNonZeroPanelSize(panelSize);
    };

    const handleResize: NonNullable<
      React.ComponentProps<typeof ResizablePrimitive.Panel>["onResize"]
    > = (size, previousSize) => {
      updateContentPanelSize(size);
      onResize?.(size, previousSize);
    };

    return (
      <ResizablePrimitive.Panel
        ref={forwardedRef}
        defaultSize={defaultSize}
        onResize={handleResize}
        className={cn(
          panelGroupContext?.animateLayoutChanges &&
            "motion-reduce:transition-none",
          panelGroupContext?.animateLayoutChanges &&
            !panelGroupContext?.isResizing &&
            "transition-[flex-grow] duration-300 ease-out-quint",
          className
        )}
        {...props}
      >
        {preserveContentLayout ? (
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

const isKeyboardResizeKey = (key: string) => {
  switch (key) {
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "End":
    case "Enter":
    case "Home":
      return true;
    default:
      return false;
  }
};

type ResizableHandleProps = React.ComponentProps<
  typeof ResizablePrimitive.PanelResizeHandle
> & {
  withHandle?: boolean;
};

const ResizableHandle = ({
  withHandle,
  className,
  disabled,
  onBlur,
  onDragging,
  onKeyDownCapture,
  onKeyUpCapture,
  ...props
}: ResizableHandleProps) => {
  const panelGroupContext = React.useContext(ResizablePanelGroupContext);

  const handleDragging = (isDragging: boolean) => {
    panelGroupContext?.setIsDragging(isDragging);
    onDragging?.(isDragging);
  };

  const handleKeyDownCapture: NonNullable<
    ResizableHandleProps["onKeyDownCapture"]
  > = (event) => {
    onKeyDownCapture?.(event);

    if (
      !disabled &&
      !event.defaultPrevented &&
      !event.isPropagationStopped() &&
      isKeyboardResizeKey(event.key)
    ) {
      panelGroupContext?.setIsKeyboardResizing(true);
    }
  };

  const handleKeyUpCapture: NonNullable<
    ResizableHandleProps["onKeyUpCapture"]
  > = (event) => {
    if (isKeyboardResizeKey(event.key)) {
      panelGroupContext?.setIsKeyboardResizing(false);
    }

    onKeyUpCapture?.(event);
  };

  const handleBlur = () => {
    panelGroupContext?.setIsKeyboardResizing(false);
    onBlur?.();
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
      disabled={disabled}
      onBlur={handleBlur}
      onDragging={handleDragging}
      onKeyDownCapture={handleKeyDownCapture}
      onKeyUpCapture={handleKeyUpCapture}
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
