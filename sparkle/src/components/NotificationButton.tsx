import { LegacyButton } from "@sparkle/components/Button";
import { Counter } from "@sparkle/components/Counter";
import { cn } from "@sparkle/lib/utils";
import React from "react";

interface NotificationButtonProps {
  buttonProps: React.ComponentProps<typeof LegacyButton>;
  counterProps: React.ComponentProps<typeof Counter>;
  className?: string;
}

const NotificationButton = ({
  className,
  buttonProps,
  counterProps,
}: NotificationButtonProps) => {
  return (
    <div className={cn("relative", className)}>
      <LegacyButton {...buttonProps} />
      {counterProps.value > 0 && (
        <Counter {...counterProps} className="absolute -right-2 -top-2" />
      )}
    </div>
  );
};

export { NotificationButton };
