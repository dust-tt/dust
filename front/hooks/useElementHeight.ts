import { useCallback, useRef, useState } from "react";

/**
 * Tracks the rendered height of the element the returned `ref` is attached to, e.g. to offset
 * a sticky element by the height of the sticky element stacked above it.
 */
export function useElementHeight() {
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node) {
      return;
    }

    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return { height, ref };
}
