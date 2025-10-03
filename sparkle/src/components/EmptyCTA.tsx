import * as React from "react";

import { Button, RegularButtonProps } from "@sparkle/components/";
import { cn } from "@sparkle/lib/utils";

interface EmptyCTAProps extends React.HTMLAttributes<HTMLDivElement> {
  action: React.ReactNode;
  message?: string;
  styleProps?: React.CSSProperties;
}

const EmptyCTA = React.forwardRef<HTMLDivElement, EmptyCTAProps>(
  ({ action, message, styleProps, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "s-flex s-w-full s-flex-col s-items-center s-justify-center s-gap-2 s-rounded-xl s-p-12",
        "s-border s-border-border s-bg-muted-background",
        "dark:s-border-border-night dark:s-bg-muted-background-night",
        className
      )}
      style={styleProps}
      {...props}
    >
      {message && (
        <div
          className={cn(
            "s-text-center s-text-sm",
            "s-text-muted-foreground dark:s-text-muted-foreground-night"
          )}
        >
          {message}
        </div>
      )}
      <div>{action}</div>
    </div>
  )
);

EmptyCTA.displayName = "EmptyCTA";

interface EmptyCTAButtonProps extends RegularButtonProps {
  icon: React.ComponentType;
  label: string;
  dataAnalytics?: string;
}

const EmptyCTAButton: React.FC<EmptyCTAButtonProps> = ({
  icon,
  label,
  variant = "highlight",
  dataAnalytics,
  ...props
}) => (
  <Button
    icon={icon}
    label={label}
    variant={variant}
    dataAnalytics={dataAnalytics}
    {...props}
  />
);

EmptyCTAButton.displayName = "EmptyCTAButton";

export { EmptyCTA, EmptyCTAButton };
