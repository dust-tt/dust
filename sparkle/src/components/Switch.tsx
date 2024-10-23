import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "data-[state=checked]:s-bg-highlight-light data-[state=unchecked]:s-bg-primary-muted",
      "focus-visible:s-ring-ring focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2 focus-visible:s-ring-offset-background",
      "s-peer s-inline-flex s-h-6 s-w-11 s-shrink-0 s-cursor-pointer s-items-center s-rounded-full s-border-2 s-border-transparent s-transition-colors",
      "disabled:s-cursor-not-allowed disabled:s-opacity-50",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "s-pointer-events-none s-block s-h-5 s-w-5 s-rounded-full s-bg-background s-shadow-lg s-ring-0 s-transition-transform data-[state=checked]:s-translate-x-5 data-[state=unchecked]:s-translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
