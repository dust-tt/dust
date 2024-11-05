import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import * as React from "react";
import { twMerge } from "tailwind-merge";

export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function assertNever(x: never): never {
  throw new Error(`${x} is not of type never. This should never happen.`);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
