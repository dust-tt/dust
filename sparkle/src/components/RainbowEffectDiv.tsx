import * as React from "react";

import { cn } from "@sparkle/lib/utils";

interface RainbowEffectDivProps {
  disabled?: boolean;
  className?: string;
  outerClassName?: string;
  children: React.ReactNode;
  backgroundColor?: string;
  borderColor?: string;
}

export function RainbowEffectDiv({
  children,
  disabled,
  className,
  ...props
}: RainbowEffectDivProps) {
  if (disabled) {
    return (
      <div className={cn(className)} {...props}>
        {children}
      </div>
    );
  }

  const rainbowClassBlur =
    "s-absolute s-bottom-[20%] s-left-1/2 s-z-0 s-h-1/5 s-w-4/5 s--translate-x-1/2 s-animate-rainbow s-bg-rainbow-gradient s-bg-[length:200%] [filter:blur(calc(1.5*1rem))]";

  return (
    <div className={cn(className, "s-relative")}>
      <div className={rainbowClassBlur} />
      <div {...props}>{children}</div>
    </div>
  );
}
