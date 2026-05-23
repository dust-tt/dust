import { useCallback, useEffect, useRef, useState } from "react";

export function useInputBarOverlayTracker(
  onOverlayOpenChange?: (open: boolean) => void
) {
  const openOverlaysRef = useRef(new Set<string>());
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  const notifyOverlayOpenChange = useCallback(() => {
    const open = openOverlaysRef.current.size > 0;
    setIsOverlayOpen(open);
    onOverlayOpenChange?.(open);
  }, [onOverlayOpenChange]);

  const setOverlayOpen = useCallback(
    (key: string, open: boolean) => {
      if (open) {
        openOverlaysRef.current.add(key);
      } else {
        openOverlaysRef.current.delete(key);
      }
      notifyOverlayOpenChange();
    },
    [notifyOverlayOpenChange]
  );

  useEffect(() => {
    notifyOverlayOpenChange();
  }, [notifyOverlayOpenChange]);

  return { isOverlayOpen, setOverlayOpen };
}
