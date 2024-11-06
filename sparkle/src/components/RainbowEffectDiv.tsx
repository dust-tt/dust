import * as React from "react";

import { cn } from "@sparkle/lib/utils";

interface RainbowEffectDivProps {
  disabled?: boolean;
  className?: string;
  outerClassName?: string;
  backgroundColor: string;
  borderColor: string;
  children: React.ReactNode;
}

/**
 * RainbowEffectDiv is a div that has a rainbow effect below to raise attention
 * (see sparkle)
 *
 * It animates the border and relies on the background to make the rainbow
 * effect, thus `backgroundColor` and `borderColor` are required.
 *
 * Since it encompasses the children into an outer div, with a sister div to
 * hold the rainbow, there is an `outerClassName` prop to style the outer div in
 * addition to the `className` prop to style the inner div.
 *
 * Note: using this to wrap components that already have borders might lead to
 * pixel issues. The recommended way is to define the border within this div,
 * via `borderColor` and `className`
 */
export function RainbowEffectDiv({
  children,
  disabled,
  className,
  outerClassName,
  ...props
}: RainbowEffectDivProps) {
  if (disabled) {
    return (
      <div className={cn(className, outerClassName)} {...props}>
        {children}
      </div>
    );
  }

  const rainbowClassBlur =
    "s-absolute s-bottom-[14%] s-left-1/2 s-z-0 s-h-2/5 s-w-4/5 s--translate-x-1/2 s-animate-rainbow s-bg-rainbow-gradient s-bg-[length:200%] [filter:blur(calc(1.8*1rem))]";

  return (
    <div className={cn(outerClassName, "s-relative")}>
      <div className={rainbowClassBlur} />
      <div {...props}>{children}</div>
    </div>
  );
}
