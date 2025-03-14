import type { ReactNode } from "react";
import React, { useCallback, useEffect, useState } from "react";

import { classNames } from "@app/lib/utils";

// Define your scroll limit here
const SCROLL_LIMIT_1 = 12;

interface ScrollingHeaderProps {
  children: ReactNode;
}

const ScrollingHeader = ({ children }: ScrollingHeaderProps) => {
  const [isScrolled, setIsScrolled] = useState(false);

  const checkScroll = useCallback(() => {
    setIsScrolled(window.scrollY > SCROLL_LIMIT_1);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", checkScroll);
    return () => window.removeEventListener("scroll", checkScroll);
  }, [checkScroll]);

  // CSS classes defined in strings
  const baseClasses =
    "fixed top-0 w-full transition-all duration-500 ease-out border-b z-50";
  const idleClasses = "h-24 border-transparent";
  const scrolledClasses =
    "h-16 border-slate-800 bg-slate-900/70 backdrop-blur-lg";

  // Combine them depending on state
  const combinedClasses = classNames(
    baseClasses,
    isScrolled ? scrolledClasses : idleClasses
  );

  return (
    <div className={combinedClasses}>
      <div className="absolute bottom-0 left-0 right-0 top-0 z-20">
        {children}
      </div>
    </div>
  );
};

export default ScrollingHeader;
