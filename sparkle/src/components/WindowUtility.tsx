import { useEffect, useState } from "react";

// Define breakpoints
export const breakpoints = {
  xxs: 0,
  xs: 512,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

// Helper function to determine active breakpoint
function getActiveBreakpoint(width: number): keyof typeof breakpoints {
  const breakpointEntries = Object.entries(breakpoints) as [
    keyof typeof breakpoints,
    number,
  ][];
  // Sort breakpoints from largest to smallest
  const sortedBreakpoints = breakpointEntries.sort(([, a], [, b]) => b - a);

  for (const [breakpoint, minWidth] of sortedBreakpoints) {
    if (width >= minWidth) {
      return breakpoint;
    }
  }
  return "xs";
}

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
