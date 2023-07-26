import React, { useState, useEffect } from "react";

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
    "absolute inline-flex items-center justify-center whitespace-nowrap z-10 px-3 py-2 text-sm rounded-xl border shadow-md transition-all duration-500 ease-out transform bg-structure-0 dark:bg-structure-0-dark text-element-700 dark:text-element-700-dark left-1/2 -translate-x-1/2";
  const hiddenClasses = "translate-y-2 opacity-0";
  const visibleClasses = "-translate-y-0 opacity-100";

  const tooltipPositionClasses =
    position === "above" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div
      onMouseEnter={handleMouseOver}
      onMouseLeave={handleMouseLeave}
      className="relative inline-block"
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
