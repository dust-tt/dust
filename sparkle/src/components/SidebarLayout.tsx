// This component is a work in ProgressEvent. Not ready for production.

import "../styles/allotment.css";

import { customColors } from "@sparkle/lib/colors";
import { cn } from "@sparkle/lib/utils";
import { Allotment, LayoutPriority } from "allotment";
import * as React from "react";

/**
 * Props for the SidebarLayout component
 */
export interface SidebarLayoutProps {
  /** The sidebar content to display */
  sidebar: React.ReactNode;
  /** The main content area */
  content: React.ReactNode;
  /** Default sidebar width in pixels (default: 280) */
  defaultSidebarWidth?: number;
  /** Minimum sidebar width in pixels (default: 200) */
  minSidebarWidth?: number;
  /** Maximum sidebar width in pixels (default: 400) */
  maxSidebarWidth?: number;
  /** Whether the sidebar can be collapsed (default: true) */
  collapsible?: boolean;
  /** Callback function called when sidebar is toggled */
  onSidebarToggle?: (collapsed: boolean) => void;
  /** Additional className for the container */
  className?: string;
  /** Additional className for the sidebar pane */
  sidebarClassName?: string;
  /** Additional className for the content pane */
  contentClassName?: string;
}

/**
 * Ref methods exposed by SidebarLayout
 */
export interface SidebarLayoutRef {
  /** Toggle the sidebar collapsed state */
  toggle: () => void;
  /** Collapse the sidebar */
  collapse: () => void;
  /** Expand the sidebar */
  expand: () => void;
}

/**
 * An app-shell layout pairing a collapsible, drag-resizable side panel (built on
 * Allotment) with a main content area. It exposes an imperative handle
 * (`SidebarLayoutRef`) with `toggle` / `collapse` / `expand`, and reveals the collapsed
 * sidebar as an overlay when hovering the left edge. Use it for top-level page
 * scaffolding that needs a persistent sidebar next to a main region, composing the
 * sidebar from `NavigationList` items and wrapping long content in `ScrollArea`.
 *
 * @summary Collapsible resizable sidebar layout.
 */
export const SidebarLayout = React.forwardRef<
  SidebarLayoutRef,
  SidebarLayoutProps
>(function SidebarLayout(
  {
    sidebar,
    content,
    defaultSidebarWidth = 280,
    minSidebarWidth = 200,
    maxSidebarWidth = 400,
    collapsible = true,
    onSidebarToggle,
    className,
    sidebarClassName,
    contentClassName,
  },
  ref
) {
  const allotmentRef = React.useRef<React.ComponentRef<typeof Allotment>>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState(defaultSidebarWidth);
  const isTogglingRef = React.useRef(false);

  // Toggle sidebar function
  const toggleSidebar = React.useCallback(() => {
    if (allotmentRef.current) {
      isTogglingRef.current = true;
      if (isSidebarCollapsed) {
        // Expand to last stored width - use requestAnimationFrame to ensure size is set correctly
        requestAnimationFrame(() => {
          if (allotmentRef.current) {
            allotmentRef.current.resize([sidebarWidth]);
          }
        });
        setIsSidebarCollapsed(false);
        setIsHovering(false);
        onSidebarToggle?.(false);
      } else {
        // Collapse to 0
        allotmentRef.current.resize([0]);
        setIsSidebarCollapsed(true);
        setIsHovering(false);
        onSidebarToggle?.(true);
      }
      // Reset toggle flag after animation completes
      setTimeout(() => {
        isTogglingRef.current = false;
      }, 300);
    }
  }, [isSidebarCollapsed, sidebarWidth, onSidebarToggle]);

  // Handle hover reveal when collapsed
  const handleLeftEdgeHover = React.useCallback(() => {
    if (isSidebarCollapsed && collapsible) {
      // Set hovering state - this will trigger overlay render
      setIsHovering(true);
    }
  }, [isSidebarCollapsed, collapsible]);

  const handleSidebarMouseLeave = React.useCallback(() => {
    if (isSidebarCollapsed && isHovering && collapsible) {
      // Hide overlay but keep collapsed state unchanged
      setIsHovering(false);
    }
  }, [isSidebarCollapsed, isHovering, collapsible]);

  // Handle size changes from Allotment
  const handleChange = React.useCallback(
    (sizes: number[]) => {
      const sidebarSize = sizes[0] ?? 0;
      const wasCollapsed = isSidebarCollapsed;
      const nowCollapsed = sidebarSize === 0;

      // Track sidebar width whenever it changes (when not toggling and not collapsed)
      if (!isTogglingRef.current && !wasCollapsed && sidebarSize > 0) {
        setSidebarWidth(sidebarSize);
      }

      // Only update collapsed state if it's from toggle button
      // Hover reveal should not change the collapsed state
      if (wasCollapsed !== nowCollapsed && isTogglingRef.current) {
        setIsSidebarCollapsed(nowCollapsed);
        if (!nowCollapsed) {
          setIsHovering(false);
        }
        onSidebarToggle?.(nowCollapsed);
      }
    },
    [isSidebarCollapsed, onSidebarToggle]
  );

  // Expose methods via ref
  React.useImperativeHandle(
    ref,
    () => ({
      toggle: toggleSidebar,
      collapse: () => {
        if (allotmentRef.current && !isSidebarCollapsed) {
          isTogglingRef.current = true;
          allotmentRef.current.resize([0]);
          setIsSidebarCollapsed(true);
          setIsHovering(false);
          onSidebarToggle?.(true);
          setTimeout(() => {
            isTogglingRef.current = false;
          }, 300);
        }
      },
      expand: () => {
        if (allotmentRef.current && isSidebarCollapsed) {
          isTogglingRef.current = true;
          requestAnimationFrame(() => {
            if (allotmentRef.current) {
              allotmentRef.current.resize([sidebarWidth]);
            }
          });
          setIsSidebarCollapsed(false);
          setIsHovering(false);
          onSidebarToggle?.(false);
          setTimeout(() => {
            isTogglingRef.current = false;
          }, 300);
        }
      },
    }),
    [toggleSidebar, isSidebarCollapsed, sidebarWidth, onSidebarToggle]
  );

  return (
    <div className={cn("relative flex h-full w-full", className)}>
      {/* Allotment CSS variables for resize border customization */}
      <style>{`
        :root {
          --focus-border: linear-gradient(to bottom, ${customColors.gray[100]}, ${customColors.blue[400]}, ${customColors.gray[100]}); /* border.focus.DEFAULT */
          --separator-border: transparent; /* border.dark.DEFAULT */
          --sash-size: 8px;
          --sash-hover-size: 2px;
        }
        .dark {
          --focus-border: linear-gradient(to bottom, ${customColors.gray[900]}, ${customColors.blue[600]}, ${customColors.gray[900]}); /* border.focus.night */
          --separator-border: transparent; /* border.dark.night */
        }
        .allotment-module_splitView__L-yRc.allotment-module_separatorBorder__x-rDS
          > .allotment-module_splitViewContainer__rQnVa
          > .allotment-module_splitViewView__MGZ6O:not(:first-child)::before {
          width: 1px;
          transition: width 200ms, background-color 200ms;
        }
      `}</style>
      {/* Hover zone when collapsed */}
      {isSidebarCollapsed && collapsible && (
        <div
          className="fixed left-0 top-0 z-50 h-full w-2 cursor-pointer"
          onMouseEnter={handleLeftEdgeHover}
          aria-hidden="true"
        />
      )}

      {/* Overlay sidebar when collapsed - always render, control visibility with transform */}
      {isSidebarCollapsed && collapsible && (
        <div
          className={cn(
            "fixed left-0 top-0 z-50 flex h-full flex-col shadow-lg",
            "transition-transform duration-300 ease-in-out",
            isHovering ? "translate-x-0" : "translate-x-[-100%]",
            sidebarClassName
          )}
          style={{ width: `${defaultSidebarWidth}px` }}
          onMouseLeave={handleSidebarMouseLeave}
        >
          <div className="flex h-full w-full flex-col">{sidebar}</div>
        </div>
      )}

      <Allotment
        ref={allotmentRef}
        vertical={false}
        proportionalLayout={false}
        onChange={handleChange}
        className="h-full w-full"
      >
        {/* Always render sidebar pane, but keep at width 0 when collapsed */}
        <Allotment.Pane
          minSize={minSidebarWidth}
          maxSize={maxSidebarWidth}
          preferredSize={isSidebarCollapsed ? 0 : sidebarWidth}
          className={cn("flex flex-col overflow-hidden", sidebarClassName)}
        >
          {/* Show content when visible (not collapsed) */}
          {!isSidebarCollapsed && (
            <div className="flex h-full w-full flex-col">{sidebar}</div>
          )}
        </Allotment.Pane>

        <Allotment.Pane
          priority={LayoutPriority.High}
          className={cn("flex flex-col", contentClassName)}
        >
          <div className="flex h-full w-full flex-col">{content}</div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
