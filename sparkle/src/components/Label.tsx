import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

const labelVariants = cva(
  cn(
    "s-heading-sm",
    "peer-disabled:s-cursor-not-allowed peer-disabled:s-opacity-70"
  ),
  {
    variants: {
      variant: {
        default: cn("s-text-foreground", "dark:s-text-foreground-night"),
        muted: cn(
          "s-text-muted-foreground",
          "dark:s-text-muted-foreground-night"
        ),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {
  isMuted?: boolean;
}

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, variant, isMuted = false, ...props }, ref) => {
  const effectiveVariant = isMuted ? "muted" : variant;

  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants({ variant: effectiveVariant }), className)}
      {...props}
    />
  );
});
Label.displayName = LabelPrimitive.Root.displayName;

export { Label, labelVariants };
