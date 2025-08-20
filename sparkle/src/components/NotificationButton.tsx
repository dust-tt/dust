import React from "react";

import { Button } from "@sparkle/components/Button";
import { Counter } from "@sparkle/components/Counter";
import { cn } from "@sparkle/lib/utils";

interface NotificationButtonProps {
  buttonProps: React.ComponentProps<typeof Button>;
  counterProps: React.ComponentProps<typeof Counter>;
  className?: string;
}

// For compound components to work with asChild, we need to merge props and ref
// onto the clickable element (Button) while maintaining the wrapper structure
const NotificationButton = React.forwardRef<
  HTMLButtonElement,
  NotificationButtonProps
>(({ className, buttonProps, counterProps, ...restProps }, ref) => {
  return (
    <div className={cn("s-relative", className)}>
      <Button
        ref={ref}
        {...buttonProps}
        {...restProps} // Merge any additional props from parent (like onClick from PopoverTrigger)
      />
      {counterProps.value > 0 && (
        <Counter
          {...counterProps}
          className={cn(
            "s-absolute -s-right-2 -s-top-2",
            counterProps.className
          )}
        />
      )}
    </div>
  );
});

NotificationButton.displayName = "NotificationButton";

export { NotificationButton };
