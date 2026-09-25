import { useEffect, useState } from "react";

// Tracks a value derived from the element width, starting from the window width until measured.
// Deriving it in the observer keeps a divider drag from re-rendering on every frame.
export function useElementWidth<T>(
  element: HTMLElement | null,
  fromWidth: (width: number) => T
) {
  const [value, setValue] = useState(() => fromWidth(window.innerWidth));

  useEffect(() => {
    if (!element) {
      return;
    }
    const resizeObserver = new ResizeObserver(([entry]) => {
      setValue(fromWidth(entry.contentRect.width));
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [element, fromWidth]);

  return value;
}
