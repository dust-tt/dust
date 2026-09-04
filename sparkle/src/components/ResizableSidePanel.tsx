import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@sparkle/components/Resizable";
import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

export interface ResizableSidePanelProps {
  /** The main page content the panel docks beside. */
  children: ReactNode;
  /** Panel content. Keep the panel mounted and drive isOpen so it keeps its state. */
  panel: ReactNode;
  isOpen?: boolean;
  /** Panel width as a percentage of the available row, used when it opens. */
  defaultSize?: number;
  /** Smallest width the panel can be dragged to, as a percentage. */
  minSize?: number;
  /** Smallest width the main content can be squeezed to, as a percentage. */
  minContentSize?: number;
  /** Locks the divider, for instance while the panel is shown full screen. */
  isResizable?: boolean;
  /**
   * Called once a collapse settles: on release of a drag that closed the
   * panel, or when the closing animation finishes.
   */
  onCollapse?: () => void;
  /**
   * Width below which the main content is considered too cramped. Paired with
   * onContentSqueezed to let the host reclaim space from elsewhere.
   */
  minContentWidthPx?: number;
  /**
   * Fired while dragging the divider once the main content falls under
   * minContentWidthPx. Only drags trigger it, so a host that responds by
   * collapsing some other chrome cannot fight the user re-expanding it.
   */
  onContentSqueezed?: () => void;
  className?: string;
}

/**
 * Docks a resizable, collapsible panel to the right of the main content,
 * outside of whatever container the content itself uses. The divider is
 * draggable and the panel animates open and shut. The forwarded ref exposes
 * the panel's imperative handle for hosts that resize it programmatically.
 *
 * @example
 * ```tsx
 * <ResizableSidePanel isOpen={isOpen} panel={<MyPanel />}>
 *   <PageContent />
 * </ResizableSidePanel>
 * ```
 */
export const ResizableSidePanel = React.forwardRef<
  ImperativePanelHandle,
  ResizableSidePanelProps
>(
  (
    {
      children,
      panel,
      isOpen = false,
      defaultSize = 30,
      minSize = 20,
      minContentSize = 30,
      isResizable = true,
      onCollapse,
      minContentWidthPx,
      onContentSqueezed,
      className,
    },
    ref
  ) => {
    const panelRef = React.useRef<ImperativePanelHandle>(null);
    const rowRef = React.useRef<HTMLDivElement>(null);
    const [panelContentSizePercent, setPanelContentSizePercent] =
      React.useState(defaultSize);

    React.useImperativeHandle<
      ImperativePanelHandle | null,
      ImperativePanelHandle | null
    >(ref, () => panelRef.current);

    React.useEffect(() => {
      if (!panelRef.current) {
        return;
      }
      if (!isOpen) {
        panelRef.current.collapse();
      } else if (panelRef.current.isCollapsed()) {
        panelRef.current.expand(defaultSize);
      } else {
        panelRef.current.resize(defaultSize);
      }
    }, [isOpen, defaultSize]);

    const handlePanelResize = React.useCallback(
      (panelSizePercent: number) => {
        if (panelSizePercent > 0) {
          setPanelContentSizePercent(panelSizePercent);
        }
        if (!onContentSqueezed || !minContentWidthPx || !rowRef.current) {
          return;
        }
        const rowWidthPx = rowRef.current.getBoundingClientRect().width;
        const contentWidthPx = (rowWidthPx * (100 - panelSizePercent)) / 100;
        if (contentWidthPx < minContentWidthPx) {
          onContentSqueezed();
        }
      },
      [onContentSqueezed, minContentWidthPx]
    );

    return (
      <div
        ref={rowRef}
        className={cn(
          "relative flex h-full w-full flex-1 @container",
          className
        )}
      >
        <ResizablePanelGroup
          animateLayoutChanges
          direction="horizontal"
          className="flex h-full w-full flex-1"
        >
          <ResizablePanel defaultSize={100} minSize={minContentSize}>
            {children}
          </ResizablePanel>

          <ResizableHandle
            withHandle={isOpen && isResizable}
            disabled={!isOpen || !isResizable}
            className="hidden md:flex"
            onDragging={(isDragging) => {
              // Pointer resizing skips transitions, so release completes a drag collapse.
              if (!isDragging && panelRef.current?.isCollapsed()) {
                onCollapse?.();
              }
            }}
          />

          <ResizablePanel
            ref={panelRef}
            defaultSize={isOpen ? defaultSize : 0}
            minSize={isOpen ? minSize : 0}
            collapsedSize={0}
            collapsible
            onResize={handlePanelResize}
            onTransitionEnd={(event) => {
              // Programmatic and keyboard collapses settle when the motion completes.
              if (
                event.target === event.currentTarget &&
                event.propertyName === "flex-grow" &&
                panelRef.current?.isCollapsed()
              ) {
                onCollapse?.();
              }
            }}
            className={cn(
              "overflow-hidden",
              isOpen
                ? "absolute inset-0 z-50 md:relative md:inset-auto md:z-auto"
                : "hidden md:block"
            )}
          >
            <div
              className="h-full min-w-full overflow-hidden bg-panel-background @container md:min-w-0"
              // Keep content width and container queries stable during animation.
              style={{ width: `${panelContentSizePercent}cqw` }}
            >
              {panel}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }
);
ResizableSidePanel.displayName = "ResizableSidePanel";
