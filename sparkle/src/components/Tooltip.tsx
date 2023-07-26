import React, { useEffect, useState } from "react";

interface TooltipProps {
  children: React.ReactNode;
  label: string;
  position?: "above" | "below";
}

export function Tooltip({ children, label, position = "above" }: TooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [timerId, setTimerId] = useState<number | null>(null);

  const handleMouseOver = () => {
    const id = window.setTimeout(() => {
      setIsHovered(true);
    }, 800);
    setTimerId(id);
  };

  const handleMouseLeave = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    setIsHovered(false);
  };

  useEffect(() => {
    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [timerId]);

  const baseClasses =
    "s-absolute s-inline-flex s-items-center s-justify-center s-whitespace-nowrap s-z-10 s-px-3 s-py-2 s-text-sm s-rounded-xl s-border s-shadow-md s-transition-all s-duration-500 s-ease-out s-transform s-bg-structure-0 dark:s-bg-structure-0-dark s-text-element-700 dark:s-text-element-700-dark s-left-1/2 s-translate-x-1/2";
  const hiddenClasses = "s-translate-y-2 s-opacity-0";
  const visibleClasses = "-s-translate-y-0 s-opacity-100";

  const tooltipPositionClasses =
    position === "above" ? "s-bottom-full s-mb-2" : "s-top-full s-mt-2";

  return (
    <div
      onMouseEnter={handleMouseOver}
      onMouseLeave={handleMouseLeave}
      className="s-relative s-inline-block"
    >
      {children}
      <div
        className={`${
          isHovered ? visibleClasses : hiddenClasses
        } ${baseClasses} ${tooltipPositionClasses}`}
        onAnimationEnd={() => setIsHovered(false)}
      >
        {label}
      </div>
    </div>
  );
}
