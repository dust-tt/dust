import { cn } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

// Outlasts `duration-exit`, the exit animation, before the content unmounts.
const EXIT_MS = 200;

/**
 * Keeps the last shown value while it animates out, then drops it. `value` MUST keep its
 * identity across renders while it does not change.
 */
export const usePresence = <T>(value: T | null) => {
  const [last, setLast] = useState(value);
  const [mounted, setMounted] = useState(value !== null);
  const open = value !== null;
  if (open && value !== last) {
    setLast(value);
  }
  if (open && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (open || !mounted) {
      return;
    }
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  return { shown: open ? value : mounted ? last : null, open };
};

/** Eases in when opening and out when closing; closed content takes no pointer events. */
export const presenceClass = (open: boolean) =>
  open
    ? "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-enter ease-enter motion-reduce:animate-none"
    : cn(
        "pointer-events-none animate-out fade-out-0 zoom-out-95 slide-out-to-top-1 fill-mode-forwards duration-exit ease-in-quad",
        "motion-reduce:invisible motion-reduce:animate-none"
      );
