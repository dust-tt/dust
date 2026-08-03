import { useEffect, useRef } from "react";

/**
 * Prevents window/document scroll while `enabled` (e.g. mobile full-screen overlay).
 * Uses position:fixed on body so iOS Safari does not chain scroll to content behind.
 */
export function useLockDocumentScroll(enabled: boolean) {
  const scrollYRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    scrollYRef.current = window.scrollY;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      width: style.width,
      overflow: style.overflow,
    };

    style.position = "fixed";
    style.top = `-${scrollYRef.current}px`;
    style.width = "100%";
    style.overflow = "hidden";

    return () => {
      style.position = previous.position;
      style.top = previous.top;
      style.width = previous.width;
      style.overflow = previous.overflow;
      window.scrollTo(0, scrollYRef.current);
    };
  }, [enabled]);
}
