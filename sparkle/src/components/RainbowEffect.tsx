import * as React from "react";

import { cn } from "@sparkle/lib/utils";

interface RainbowEffectProps {
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}

export function RainbowEffect({
  children,
  disabled,
  className,
  containerClassName,
  ...props
}: RainbowEffectProps) {
  if (disabled) {
    return (
      <div className={cn(className)} {...props}>
        {children}
      </div>
    );
  }

  const rainbowClassBlur =
    "s-absolute s-bottom-[14%] s-left-1/2 s-z-0 s-h-1/5 s-w-4/5 s--translate-x-1/2 s-animate-rainbow s-bg-rainbow-gradient s-bg-[length:200%] [filter:blur(calc(1.5*1rem))]";

  return (
    <div className={cn(containerClassName, "s-relative")}>
      <div className={rainbowClassBlur} />
      <div className={className} {...props}>
        {children}
      </div>
    </div>
  );
}
