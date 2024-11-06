import * as React from "react";

import { Button, ButtonProps } from "@sparkle/components/";
import { cn } from "@sparkle/lib/utils";

interface EmptyCTAProps extends React.HTMLAttributes<HTMLDivElement> {
  action: React.ReactNode;
  message: string;
}

const EmptyCTA = React.forwardRef<HTMLDivElement, EmptyCTAProps>(
  ({ action, message, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "s-flex s-w-full s-flex-col s-items-center s-justify-center s-gap-2 s-rounded-xl s-bg-structure-100 s-p-12",
        className
      )}
      {...props}
    >
      <div className="s-text-center s-text-sm s-text-muted-foreground">
        {message}
      </div>
      <div>{action}</div>
    </div>
  )
);

EmptyCTA.displayName = "EmptyCTA";

interface EmptyCTAButtonProps extends ButtonProps {
  icon: React.ComponentType;
  label: string;
}

const EmptyCTAButton: React.FC<EmptyCTAButtonProps> = ({
  icon,
  label,
  variant = "highlight",
  ...props
}) => <Button icon={icon} label={label} variant={variant} {...props} />;

EmptyCTAButton.displayName = "EmptyCTAButton";

export { EmptyCTA, EmptyCTAButton };