import { useClientType } from "@app/lib/context/clientType";
import { createContext, useContext, useEffect, useState } from "react";

export const MOBILE_BREAKPOINT = 768;

export function useIsMobile({
  excludeExtension = true,
}: {
  excludeExtension?: boolean;
} = {}) {
  const clientType = useClientType();
  // Read from window immediately so the initial value is correct to avoid keyboard pop up on mobile.
  const [isMobile, setIsMobile] = useState<boolean>(
    () => !!window && window.innerWidth < MOBILE_BREAKPOINT
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // The extension is narrow but not mobile.
  if (excludeExtension && clientType === "extension") {
    return false;
  }

  return isMobile;
}

// Lets a container narrower than the screen (e.g. a conversation next to a docked side panel)
// mark its subtree as width constrained.
export const WidthConstrainedContext = createContext(false);

// Whether the layout is short on horizontal room: a narrow screen, the extension, or a container
// flagged through WidthConstrainedContext. Touch-specific behaviors should use `useIsMobile`.
export function useIsWidthConstrained() {
  const isContainerConstrained = useContext(WidthConstrainedContext);
  const isScreenConstrained = useIsMobile({ excludeExtension: false });
  return isScreenConstrained || isContainerConstrained;
}

// Whether the pointer can hover — the capability hover-only affordances
// (submenus that open on pointer enter) need. False on touch devices, which a
// width breakpoint alone misses: a tablet is wide but still can't hover.
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

export function useCanHover() {
  const [canHover, setCanHover] = useState<boolean>(
    () => !!window && window.matchMedia(HOVER_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(HOVER_QUERY);
    const onChange = () => setCanHover(mql.matches);
    mql.addEventListener("change", onChange);
    setCanHover(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return canHover;
}
