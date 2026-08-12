import { cn } from "@sparkle/lib/utils";
import React from "react";

function findVisualBox(host: HTMLElement | null): HTMLElement | null {
  let element = host?.firstElementChild ?? null;
  while (element instanceof HTMLElement) {
    if (window.getComputedStyle(element).borderRadius !== "0px") {
      return element;
    }
    const child = element.firstElementChild;
    if (!child) {
      return element;
    }
    element = child;
  }
  return null;
}

function useMatchedRadius(
  hostRef: React.RefObject<HTMLElement | null>,
  isEnabled: boolean
): string | undefined {
  const [radius, setRadius] = React.useState<string>();

  React.useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const target = findVisualBox(hostRef.current);
    if (!target) {
      return;
    }
    const read = () => setRadius(window.getComputedStyle(target).borderRadius);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(target);
    return () => observer.disconnect();
  }, [hostRef, isEnabled]);

  return radius;
}

interface GlintStreaksProps {
  className: string;
}

function GlintStreaks({ className }: GlintStreaksProps) {
  return (
    <span className={cn("absolute inset-0", className)}>
      <span className="absolute -top-1/2 left-0 h-[200%] w-[max(7px,5%)] rotate-[30deg] bg-linear-to-b from-transparent via-blue-50 to-transparent blur-[2px]" />
      <span className="absolute -top-1/2 left-[max(9px,7%)] h-[200%] w-[max(3px,2%)] rotate-[30deg] bg-linear-to-b from-transparent via-blue-50/60 to-transparent blur-[2px]" />
    </span>
  );
}

export interface DiscoveryGlintProps {
  children: React.ReactNode;
  isActive?: boolean;
  isBouncing?: boolean;
  isSweeping?: boolean;
  className?: string;
}

export function DiscoveryGlint({
  children,
  isActive = true,
  isBouncing = true,
  isSweeping = true,
  className,
}: DiscoveryGlintProps) {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const radius = useMatchedRadius(hostRef, isActive);
  const radiusStyle = radius ? { borderRadius: radius } : undefined;

  return (
    <span
      ref={hostRef}
      className={cn("glint-host relative inline-flex", className)}
      data-glint-active={isActive ? "true" : undefined}
    >
      {children}
      {isActive && (
        <>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 border border-blue-200",
              isBouncing && "glint-ring-pulse"
            )}
            style={radiusStyle}
          />
          {isSweeping && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden"
              style={radiusStyle}
            >
              <GlintStreaks className="glint-sweep" />
              <GlintStreaks className="glint-sweep-hover" />
            </span>
          )}
        </>
      )}
    </span>
  );
}
