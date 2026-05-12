import { classNames } from "@app/lib/utils";
import type { ReactNode } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useEffect, useState } from "react";

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

  // Header stays anchored at top-0 and uses translateY to sit below the 40px
  // announcement banner at rest, then slides up to claim the viewport top on
  // scroll. Transform + opacity-friendly properties only — avoids animating
  // `top`/`height` via `transition-all`, which triggers layout. Duration is
  // matched to the banner (200ms) so the two move as one paired unit.
  const baseClasses =
    "fixed top-0 w-full border-b z-50 transition-[transform,height,background-color,border-color] duration-200 ease-out";
  const idleClasses = "translate-y-10 h-24 border-transparent";
  const scrolledClasses =
    "translate-y-0 h-16 border-border bg-muted-background/70 backdrop-blur-lg";

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
