import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  isMuted?: boolean;
}

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, isMuted = false, ...props }, ref) => {
  const labelVariants = cn(
    "s-heading-sm",
    isMuted
      ? "s-text-muted-foreground dark:s-text-muted-foreground-night"
      : "s-text-foreground dark:s-text-foreground-night",
    "peer-disabled:s-cursor-not-allowed peer-disabled:s-opacity-70"
  );

  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants, className)}
      {...props}
    />
  );
});
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
