import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

const labelVariants = cn(
  "s-text-sm s-text-foreground s-leading-none",
  "peer-disabled:s-cursor-not-allowed peer-disabled:s-opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants, className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
