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
  /** Panel content. When omitted, children render on their own with no resize machinery. */
  panel?: ReactNode;
  isOpen?: boolean;
  /** Panel width as a percentage of the available row, used when it opens. */
  defaultSize?: number;
  /** Smallest width the panel can be dragged to, as a percentage. */
  minSize?: number;
  /** Called when the panel is collapsed by dragging it shut. */
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
 * draggable and the panel animates open and shut.
 *
 * @example
 * ```tsx
 * <ResizableSidePanel isOpen={isOpen} panel={<MyPanel />}>
 *   <PageContent />
 * </ResizableSidePanel>
 * ```
 */
export function ResizableSidePanel({
  children,
  panel,
  isOpen = false,
  defaultSize = 30,
  minSize = 20,
  onCollapse,
  minContentWidthPx,
  onContentSqueezed,
  className,
}: ResizableSidePanelProps) {
  const panelRef = React.useRef<ImperativePanelHandle>(null);
  const rowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!panelRef.current) {
      return;
    }
    if (isOpen) {
      panelRef.current.expand(defaultSize);
    } else {
      panelRef.current.collapse();
    }
  }, [isOpen, defaultSize]);

  const reportIfContentSqueezed = React.useCallback(
    (panelSizePercent: number) => {
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

  if (!panel) {
    return <>{children}</>;
  }

  return (
    <div
      ref={rowRef}
      className={cn("relative flex h-full w-full flex-1", className)}
    >
      <ResizablePanelGroup
        animateLayoutChanges
        direction="horizontal"
        className="flex h-full w-full flex-1"
      >
        <ResizablePanel defaultSize={100} minSize={30}>
          {children}
        </ResizablePanel>

        <ResizableHandle
          withHandle={isOpen}
          disabled={!isOpen}
          className="hidden md:flex"
        />

        <ResizablePanel
          ref={panelRef}
          defaultSize={isOpen ? defaultSize : 0}
          minSize={isOpen ? minSize : 0}
          collapsedSize={0}
          collapsible
          onCollapse={onCollapse}
          onResize={reportIfContentSqueezed}
          className={cn(
            "overflow-hidden",
            isOpen
              ? "absolute inset-0 z-50 md:relative md:inset-auto md:z-auto"
              : "hidden md:block"
          )}
        >
          <div className="h-full w-full overflow-hidden bg-background">
            {panel}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
