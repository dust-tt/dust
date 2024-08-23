import { useEffect, useState } from "react";

// Define breakpoints
export const breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
};

// Interface for window size state
interface WindowSizeState {
  width: number | undefined;
  height: number | undefined;
  activeBreakpoint: keyof typeof breakpoints;
}

// Custom hook to get window size and active breakpoint
export function useWindowSize() {
  const [windowSize, setWindowSize] = useState<WindowSizeState>({
    width: undefined,
    height: undefined,
    activeBreakpoint: "xs",
  });

  useEffect(() => {
    function handleResize() {
      const width = window.innerWidth;
      setWindowSize({
        width,
        height: window.innerHeight,
        activeBreakpoint: getActiveBreakpoint(width),
      });
    }

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowSize;
}

// Helper function to determine active breakpoint
function getActiveBreakpoint(width: number): keyof typeof breakpoints {
  if (width >= breakpoints.xxl) {
    return "xxl";
  }
  if (width >= breakpoints.xl) {
    return "xl";
  }
  if (width >= breakpoints.lg) {
    return "lg";
  }
  if (width >= breakpoints.md) {
    return "md";
  }
  if (width >= breakpoints.sm) {
    return "sm";
  }
  return "xs";
}
