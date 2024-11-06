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
  backgroundColor,
  borderColor,
  ...props
}: RainbowEffectDivProps) {
  if (disabled) {
    return (
      <div className={cn(className, outerClassName)} {...props}>
        {children}
      </div>
    );
  }
  const borderColorGrad1 = `hwb(from ${borderColor} h w b / 0.6)`;
  const borderColorGrad2 = `hwb(from ${borderColor} h w b / 0)`;
  const rainbowClassBorder = cn(
    "s-animate-rainbow s-rounded-xl s-border-0 s-bg-[length:200%] s-transition-colors [background-clip:padding-box,border-box,border-box] [background-origin:border-box] [border:calc(0.08*1rem)_solid_transparent] focus-visible:s-outline-none focus-visible:s-ring-1 focus-visible:s-ring-ring disabled:s-opacity-50"
  );
  const rainbowClassBlur =
    "s-absolute s-bottom-[5%] s-left-1/2 s-z-0 s-h-1/5 s-w-3/5 s--translate-x-1/2 s-animate-rainbow s-bg-[linear-gradient(90deg,hsl(var(--color-1)),hsl(var(--color-5)),hsl(var(--color-3)),hsl(var(--color-4)),hsl(var(--color-2)))] s-bg-[length:200%] [filter:blur(calc(0.8*1rem))]";

  // we need to use a style here so that we can use backgroundColor and borderColor variables
  // since the classes are not precompiled by tailwind in this context
  return (
    <div className={cn(outerClassName, "s-relative")}>
      <div className={rainbowClassBlur}></div>
      <div
        style={{
          backgroundImage: `linear-gradient(${backgroundColor}, ${backgroundColor}),linear-gradient(${borderColor} 50%,${borderColorGrad1} 80%, ${borderColorGrad2}),linear-gradient(90deg,hsl(var(--color-1)),hsl(var(--color-5)),hsl(var(--color-3)),hsl(var(--color-4)),hsl(var(--color-2)))`,
        }}
        className={cn(
          className,
          rainbowClassBorder,
          "duration-[2000ms] s-relative"
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}
