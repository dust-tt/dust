import * as React from "react";

import { cn } from "@sparkle/lib/utils";

interface RainbowEffectProps {
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
  size?: "small" | "medium" | "large"; // Define the size prop with specific options
}

export function RainbowEffect({
  children,
  disabled,
  className,
  containerClassName,
  size = "medium", // Default size is medium
  ...props
}: RainbowEffectProps) {
  if (disabled) {
    return (
      <div className={cn(className)} {...props}>
        {children}
      </div>
    );
  }

  // Define the size-based styles
  const sizeStyles = {
    small: {
      height: "s-h-[30%]",
      width: "s-w-[70%]",
      blur: "[filter:blur(calc(1rem))]",
    },
    medium: {
      height: "s-h-[40%]",
      width: "s-w-[88%]",
      blur: "[filter:blur(calc(1.5rem))]",
    },
    large: {
      height: "s-h-[45%]",
      width: "s-w-[95%]",
      blur: "[filter:blur(calc(2rem))]",
    },
  };

  const selectedSize = sizeStyles[size];

  const rainbowClassBlur = cn(
    "s-absolute s-bottom-[14%] s-left-1/2 s-z-0 s--translate-x-1/2 s-animate-rainbow s-bg-[length:200%]",
    "s-bg-rainbow-gradient dark:s-bg-rainbow-gradient-night",
    "s-transition-all",
    selectedSize.height,
    selectedSize.width,
    selectedSize.blur
  );

  return (
    <div className={cn(containerClassName, "s-relative")}>
      <div className={rainbowClassBlur} />
      <div className={className} {...props}>
        {children}
      </div>
    </div>
  );
}
