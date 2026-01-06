import "allotment/dist/style.css";

import { Allotment } from "allotment";
import * as React from "react";

import { customColors } from "@sparkle/lib/colors";
import { cn } from "@sparkle/lib/utils";

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
 * SidebarLayout component provides a resizable sidebar layout using Allotment.
 * Supports pixel-based sizing, toggle functionality, and hover reveal when collapsed.
 */
export const SidebarLayout = React.forwardRef<
  SidebarLayoutRef,
  SidebarLayoutProps
>(function SidebarLayout(
  {
    sidebar,
    content,
    defaultSidebarWidth = 280,
    minSidebarWidth: _minSidebarWidth = 200,
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
  const [lastSidebarSize, setLastSidebarSize] =
    React.useState(defaultSidebarWidth);
  const isTogglingRef = React.useRef(false);

  // Toggle sidebar function
  const toggleSidebar = React.useCallback(() => {
    if (allotmentRef.current) {
      isTogglingRef.current = true;
      if (isSidebarCollapsed) {
        // Expand to last stored size - use requestAnimationFrame to ensure size is set correctly
        requestAnimationFrame(() => {
          if (allotmentRef.current) {
            allotmentRef.current.resize([lastSidebarSize]);
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
  }, [isSidebarCollapsed, lastSidebarSize, onSidebarToggle]);

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
      let sidebarSize = sizes[0] ?? 0;
      const wasCollapsed = isSidebarCollapsed;
      const nowCollapsed = sidebarSize === 0;

      // Enforce 220px minimum when visible and not toggling
      if (
        !isTogglingRef.current &&
        !wasCollapsed &&
        sidebarSize > 0 &&
        sidebarSize < 220 &&
        collapsible
      ) {
        // Clamp to 220px minimum
        sidebarSize = 220;
        if (allotmentRef.current) {
          allotmentRef.current.resize([sidebarSize]);
        }
      }

      // Track manual resize (not from toggle or hover)
      // Only save size when:
      // - Not toggling
      // - Not hovering
      // - Sidebar is visible (not collapsed)
      // - Size is greater than 0
      if (
        !isTogglingRef.current &&
        !isHovering &&
        sidebarSize > 0 &&
        !wasCollapsed
      ) {
        setLastSidebarSize(sidebarSize);
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
    [isSidebarCollapsed, isHovering, collapsible, onSidebarToggle]
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
              allotmentRef.current.resize([lastSidebarSize]);
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
    [toggleSidebar, isSidebarCollapsed, lastSidebarSize, onSidebarToggle]
  );

  return (
    <div className={cn("s-relative s-flex s-h-full s-w-full", className)}>
      {/* Allotment CSS variables for resize border customization */}
      <style>{`
        :root {
          --focus-border: ${customColors.gray[400]}; /* border.focus.DEFAULT */
          --separator-border: ${customColors.gray[100]}; /* border.dark.DEFAULT */
          --sash-size: 8px;
          --sash-hover-size: 2px;
        }
        .s-dark {
          --focus-border: ${customColors.blue[600]}; /* border.focus.night */
          --separator-border: ${customColors.gray[700]}; /* border.dark.night */
        }
        .allotment-module_splitView__L-yRc.allotment-module_separatorBorder__x-rDS
          > .allotment-module_splitViewContainer__rQnVa
          > .allotment-module_splitViewView__MGZ6O:not(:first-child)::before {
          width: 1px;
        }
      `}</style>
      {/* Hover zone when collapsed */}
      {isSidebarCollapsed && collapsible && (
        <div
          className="s-fixed s-left-0 s-top-0 s-z-50 s-h-full s-w-2 s-cursor-pointer"
          onMouseEnter={handleLeftEdgeHover}
          aria-hidden="true"
        />
      )}

      {/* Overlay sidebar when collapsed - always render, control visibility with transform */}
      {isSidebarCollapsed && collapsible && (
        <div
          className={cn(
            "s-fixed s-left-0 s-top-0 s-z-50 s-flex s-h-full s-flex-col s-shadow-lg",
            "s-transition-transform s-duration-300 s-ease-in-out",
            isHovering ? "s-translate-x-0" : "s-translate-x-[-100%]",
            sidebarClassName
          )}
          style={{ width: `${defaultSidebarWidth}px` }}
          onMouseLeave={handleSidebarMouseLeave}
        >
          <div className="s-flex s-h-full s-w-full s-flex-col">{sidebar}</div>
        </div>
      )}

      <Allotment
        ref={allotmentRef}
        vertical={false}
        onChange={handleChange}
        className="s-h-full s-w-full"
      >
        {/* Always render sidebar pane, but keep at width 0 when collapsed */}
        <Allotment.Pane
          minSize={collapsible ? 0 : 220}
          maxSize={maxSidebarWidth}
          preferredSize={isSidebarCollapsed ? 0 : lastSidebarSize}
          snap={collapsible}
          className={cn(
            "s-flex s-flex-col s-overflow-hidden",
            sidebarClassName
          )}
        >
          {/* Show content when visible (not collapsed) */}
          {!isSidebarCollapsed && (
            <div className="s-flex s-h-full s-w-full s-flex-col">{sidebar}</div>
          )}
        </Allotment.Pane>

        <Allotment.Pane className={cn("s-flex s-flex-col", contentClassName)}>
          <div className="s-flex s-h-full s-w-full s-flex-col">{content}</div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
