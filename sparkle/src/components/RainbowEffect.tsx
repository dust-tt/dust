import { cn } from "@sparkle/lib/utils";
import * as React from "react";

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
      height: "h-[30%]",
      width: "w-[70%]",
      blur: "[filter:blur(calc(1rem))]",
    },
    medium: {
      height: "h-[40%]",
      width: "w-[88%]",
      blur: "[filter:blur(calc(1.5rem))]",
    },
    large: {
      height: "h-[45%]",
      width: "w-[95%]",
      blur: "[filter:blur(calc(2rem))]",
    },
  };

  const selectedSize = sizeStyles[size];

  const rainbowClassBlur = cn(
    "absolute bottom-[14%] left-1/2 z-0 -translate-x-1/2 animate-rainbow bg-rainbow-gradient bg-[length:200%]",
    "transition-all",
    selectedSize.height,
    selectedSize.width,
    selectedSize.blur
  );

  return (
    <div className={cn(containerClassName, "relative")}>
      <div className={rainbowClassBlur} />
      <div className={className} {...props}>
        {children}
      </div>
    </div>
  );
}
