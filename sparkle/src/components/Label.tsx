import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const labelVariants = cva(
  cn("heading-sm", "peer-disabled:cursor-not-allowed peer-disabled:opacity-70"),
  {
    variants: {
      variant: {
        default: "text-foreground",
        muted: cn("text-muted-foreground"),
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
