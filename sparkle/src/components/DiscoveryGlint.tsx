import { cn } from "@sparkle/lib/utils";
import React from "react";

export const DISCOVERY_GLINT_RADII = ["md", "lg", "xl", "full"] as const;
export type DiscoveryGlintRadius = (typeof DISCOVERY_GLINT_RADII)[number];

const RADIUS_CLASSES: Record<DiscoveryGlintRadius, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

interface GlintStreaksProps {
  className: string;
}

function GlintStreaks({ className }: GlintStreaksProps) {
  return (
    <span className={cn("absolute inset-0", className)}>
      <span className="absolute -top-1/4 left-0 h-[150%] w-[3px] rotate-[30deg] bg-blue-50 blur-[1px]" />
      <span className="absolute -top-1/3 left-[5px] h-[165%] w-[3px] rotate-[30deg] bg-blue-50/70 blur-[1px]" />
    </span>
  );
}

export interface DiscoveryGlintProps {
  children: React.ReactNode;
  isActive?: boolean;
  radius?: DiscoveryGlintRadius;
  className?: string;
}

export function DiscoveryGlint({
  children,
  isActive = true,
  radius = "lg",
  className,
}: DiscoveryGlintProps) {
  const radiusClass = RADIUS_CLASSES[radius];

  return (
    <span
      className={cn("glint-host relative inline-flex", className)}
      data-glint-active={isActive ? "true" : undefined}
    >
      {children}
      {isActive && (
        <>
          <span
            aria-hidden
            className={cn(
              "glint-ring-pulse pointer-events-none absolute inset-0 border border-blue-200",
              radiusClass
            )}
          />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 overflow-hidden",
              radiusClass
            )}
          >
            <GlintStreaks className="glint-sweep" />
            <GlintStreaks className="glint-sweep-hover" />
          </span>
        </>
      )}
    </span>
  );
}
