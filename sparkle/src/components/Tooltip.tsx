import React, { useEffect, useState } from "react";

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

  const handleMouseOver = () => {
    const id = window.setTimeout(() => {
      setIsHovered(true);
    }, 600);
    setTimerId(id);
  };

  const handleMouseLeave = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    setIsHovered(false);
  };

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
    return () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [timerId]);

  if (isTouchDevice) {
    return <>{children}</>;
  }

  const baseClasses = classNames(
    "s-absolute s-z-10 s-px-3 s-py-2 s-text-sm s-rounded-xl s-border s-shadow-md s-transition-all s-duration-500 s-ease-out s-transform",
    "s-border-structure-100 dark:s-border-structure-50-dark s-bg-structure-0 dark:s-bg-structure-100-dark s-text-element-700 dark:s-text-element-600-dark"
  );
  const hiddenClasses = "s-translate-y-2 s-opacity-0 s-pointer-events-none"; // Added s-pointer-events-none
  const visibleClasses = "-s-translate-y-0 s-opacity-100";
  const hiddenOnMobileClasses = "s-hidden sm:s-block";
  const tooltipCenterClasses = "s-left-1/2 -s-translate-x-1/2";
  const tooltipPositionClasses =
    position === "above" ? "s-bottom-full s-mb-2" : "s-top-full s-mt-2";

  // if tooltip text is too long we need to wrap it
  const labelLength = label?.length || 0;
  const labelClasses = labelLength > 80 ? "s-w-[38em]" : "s-whitespace-nowrap";

  return (
    <div
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
          tooltipPositionClasses,
          tooltipCenterClasses,
          contentChildren ? "" : labelClasses
        )}
        onAnimationEnd={() => setIsHovered(false)}
      >
        {contentChildren || label}
      </div>
    </div>
  );
}
