import { Button } from "@dust-tt/sparkle";
import type React from "react";
import { useEffect, useRef, useState } from "react";

const COLLAPSIBLE_THRESHOLD_PX = 420;
const COLLAPSED_HEIGHT_PX = 320;

interface CollapsibleContentProps {
  children: React.ReactNode;
  defaultCollapsed: boolean;
  isStreaming: boolean;
  footer?: React.ReactNode;
}

export function CollapsibleContent({
  children,
  defaultCollapsed,
  isStreaming,
  footer,
}: CollapsibleContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [exceedsThreshold, setExceedsThreshold] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (isStreaming) {
      return;
    }

    const el = contentRef.current;
    if (el) {
      setExceedsThreshold(el.scrollHeight > COLLAPSIBLE_THRESHOLD_PX);
    }
  }, [isStreaming]);

  const shouldShowToggle = exceedsThreshold && !isStreaming;
  const isCurrentlyCollapsed = shouldShowToggle && isCollapsed;

  const handleToggle = () => setIsCollapsed((prev) => !prev);

  return (
    <>
      <div
        ref={contentRef}
        className="relative"
        style={
          isCurrentlyCollapsed
            ? { maxHeight: `${COLLAPSED_HEIGHT_PX}px`, overflow: "hidden" }
            : undefined
        }
      >
        {children}
        {isCurrentlyCollapsed && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background dark:from-background-night" />
        )}
      </div>
      <div className="flex items-center gap-3">
        {shouldShowToggle && (
          <Button
            variant="outline"
            size="xs"
            label={isCollapsed ? "Show more" : "Show less"}
            onClick={handleToggle}
            className="text-muted-foreground"
          />
        )}
        {footer}
      </div>
    </>
  );
}
