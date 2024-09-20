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
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (isHovered && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top =
        position === "above"
          ? triggerRect.top - tooltipRect.height - 10
          : triggerRect.bottom + 10;
      let left =
        triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

      // Adjust if tooltip goes off-screen
      if (left < 0) {
        left = 0;
      }
      if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width;
      }
      if (top < 0) {
        top = triggerRect.bottom + 10; // Switch to below if above doesn't fit
      }
      if (top + tooltipRect.height > window.innerHeight) {
        top = triggerRect.top - tooltipRect.height - 10; // Switch to above if below doesn't fit
      }

      tooltipRef.current.style.top = `${top}px`;
      tooltipRef.current.style.left = `${left}px`;
    }
  }, [isHovered, position]);

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
        ref={tooltipRef}
        className={classNames(
          `${isHovered ? visibleClasses : hiddenClasses}`,
          baseClasses,
          hiddenOnMobileClasses,
          contentChildren ? "" : labelClasses
        )}
        style={{ position: "fixed", top: 0, left: 0 }}
        onAnimationEnd={() => setIsHovered(false)}
      >
        {contentChildren || label}
      </div>
    </div>
  );
}
