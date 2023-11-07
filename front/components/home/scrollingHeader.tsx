import classNames from "classnames";
import React, { ReactNode, useCallback, useEffect, useState } from "react";

// Define your scroll limit here
const SCROLL_LIMIT_1 = 12;

interface ScrollingHeaderProps {
  children: ReactNode;
  showItemY?: number; // define here
}

const ScrollingHeader = ({
  children,
  showItemY = 300,
}: ScrollingHeaderProps) => {
  const [isScrolled1, setIsScrolled1] = useState(false);
  const [isScrolled2, setIsScrolled2] = useState(false);

  const checkScroll = useCallback(() => {
    setIsScrolled1(window.scrollY > SCROLL_LIMIT_1);
    setIsScrolled2(window.scrollY > showItemY); // use here
  }, [showItemY]);

  useEffect(() => {
    window.addEventListener("scroll", checkScroll);
    return () => window.removeEventListener("scroll", checkScroll);
  }, [checkScroll, showItemY]); // add here

  useEffect(() => {
    const invisibleFirstElements = document.querySelectorAll(".invisibleFirst");
    invisibleFirstElements.forEach((element) => {
      if (isScrolled2) {
        element.classList.remove("opacity-0");
        element.classList.remove("hidden");
      } else {
        element.classList.add("opacity-0");
        element.classList.add("hidden");
      }
    });
  }, [isScrolled2]);

  // CSS classes defined in strings
  const baseClasses =
    "fixed top-0 w-full transition-all duration-500 ease-out border-b z-50";
  const idleClasses = "h-24 border-transparent";
  const scrolledClasses = "h-16 border-slate-800 backdrop-blur-lg";

  // Combine them depending on state
  const combinedClasses = classNames(
    baseClasses,
    isScrolled1 ? scrolledClasses : idleClasses
  );

  const invisibleFirstClasses = classNames(
    "invisibleFirst absolute bottom-0 left-0 right-0 top-0 z-10 bg-slate-900",
    isScrolled2 ? "opacity-60" : "opacity-0"
  );

  return (
    <div className={combinedClasses}>
      <div className="absolute bottom-0 left-0 right-0 top-0 z-20">
        {children}
      </div>
      <div className={invisibleFirstClasses} />
    </div>
  );
};

export default ScrollingHeader;
