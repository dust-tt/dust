import { Button } from "@sparkle/components/Button";
import { Counter } from "@sparkle/components/Counter";
import { cn } from "@sparkle/lib/utils";
import React from "react";

interface NotificationButtonProps {
  /** Configuration of the underlying Button (variant, size, icon, label...). */
  buttonProps: React.ComponentProps<typeof Button>;
  /** Configuration of the overlaid Counter badge (value, variant, size); hidden when value is 0. */
  counterProps: React.ComponentProps<typeof Counter>;
  className?: string;
}

/**
 * A button with an overlaid counter badge for surfacing a pending count, such
 * as unread notifications. Use it as a toolbar or header affordance that
 * opens notifications and shows how many are pending; for the toast messages
 * themselves use Notification, and for a standalone count use Counter.
 * @summary Button with an overlaid count badge.
 */
const NotificationButton = ({
  className,
  buttonProps,
  counterProps,
}: NotificationButtonProps) => {
  return (
    <div className={cn("relative", className)}>
      <Button {...buttonProps} />
      {counterProps.value > 0 && (
        <Counter {...counterProps} className="absolute -right-2 -top-2" />
      )}
    </div>
  );
};

export { NotificationButton };
