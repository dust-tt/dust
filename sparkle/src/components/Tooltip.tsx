import React, { useEffect, useRef, useState } from "react";

import { classNames } from "@sparkle/lib/utils";

export interface TooltipProps {
  children: React.ReactNode;
  label?: string;
  position?: "above" | "below";
  contentChildren?: React.ReactNode;
}

export function Tooltip({
  children,
  label,
  position = "above",
  contentChildren,
}: TooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [timerId, setTimerId] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseOver = () => {
    const id = window.setTimeout(() => {
      setIsHovered(true);
      updateTooltipPosition();
    }, 600);
    setTimerId(id);
  };

  const handleMouseLeave = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    setIsHovered(false);
  };

  const updateTooltipPosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: position === "above" ? rect.top - 10 : rect.bottom + 10,
        left: rect.left + rect.width / 2,
      });
    }
  };

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
    return () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [timerId]);

  useEffect(() => {
    window.addEventListener("scroll", updateTooltipPosition);
    window.addEventListener("resize", updateTooltipPosition);
    return () => {
      window.removeEventListener("scroll", updateTooltipPosition);
      window.removeEventListener("resize", updateTooltipPosition);
    };
  }, []);

  if (isTouchDevice) {
    return <>{children}</>;
  }

  const baseClasses = classNames(
    "s-fixed s-z-50 s-px-3 s-py-2 s-text-sm s-rounded-xl s-border s-shadow-md s-transition-all s-duration-500 s-ease-out s-transform",
    "s-border-structure-100 dark:s-border-structure-50-dark s-bg-structure-0 dark:s-bg-structure-100-dark s-text-element-700 dark:s-text-element-600-dark"
  );
  const hiddenClasses = "s-translate-y-2 s-opacity-0 s-pointer-events-none";
  const visibleClasses = "-s-translate-y-0 s-opacity-100";
  const hiddenOnMobileClasses = "s-hidden sm:s-block";
  const tooltipCenterClasses = "-s-translate-x-1/2";

  const labelLength = label?.length || 0;
  const labelClasses = labelLength > 80 ? "s-w-[38em]" : "s-whitespace-nowrap";

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseOver}
      onMouseLeave={handleMouseLeave}
      className="s-relative s-inline-block"
    >
      {children}
      <div
        className={classNames(
          `${isHovered ? visibleClasses : hiddenClasses}`,
          baseClasses,
          hiddenOnMobileClasses,
          tooltipCenterClasses,
          contentChildren ? "" : labelClasses
        )}
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
        }}
        onAnimationEnd={() => setIsHovered(false)}
      >
        {contentChildren || label}
      </div>
    </div>
  );
}
