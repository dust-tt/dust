import { CSSProperties, ReactNode } from "react";
import React from "react";

import { cn } from "@sparkle/lib/utils";

interface AnimatedShinyTextProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedShinyText({
  children,
  className,
}: AnimatedShinyTextProps) {
  return (
    <p
      style={
        {
          "--shiny-width": `100px`,
        } as CSSProperties
      }
      className={cn(
        "dark:s-text-element-400/70 s-mx-auto s-max-w-md s-text-element-600/70",
        // Shine effect
        "s-animate-shiny-text s-bg-clip-text s-bg-no-repeat [background-position:0_0] [background-size:var(--shiny-width)_100%] [transition:background-position_1s_cubic-bezier(.6,.6,0,1)]",
        // Shine gradient
        "s-bg-gradient-to-r s-from-transparent s-via-black/80 s-via-50% s-to-transparent dark:s-via-white/80",
        className
      )}
    >
      {children}
    </p>
  );
}
