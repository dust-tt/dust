import { useClientType } from "@app/lib/context/clientType";
import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const clientType = useClientType();
  const [isMobile, setIsMobile] = useState<boolean | undefined>();

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
  if (clientType === "extension") {
    return false;
  }

  return !!isMobile;
}
