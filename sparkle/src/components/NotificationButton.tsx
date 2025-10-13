import React from "react";

import { Button } from "@sparkle/components/Button";
import { Counter } from "@sparkle/components/Counter";
import { cn } from "@sparkle/lib/utils";

interface NotificationButtonProps {
  buttonProps: React.ComponentProps<typeof Button>;
  counterProps: React.ComponentProps<typeof Counter>;
  className?: string;
}

const NotificationButton = ({
  className,
  buttonProps,
  counterProps,
}: NotificationButtonProps) => {
  return (
    <div className={cn("s-relative", className)}>
      <Button {...buttonProps} />
      {counterProps.value > 0 && (
        <Counter {...counterProps} className="s-absolute -s-right-2 -s-top-2" />
      )}
    </div>
  );
};

export { NotificationButton };
