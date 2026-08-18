import { Button, type RegularButtonProps } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

interface EmptyCTAProps extends React.HTMLAttributes<HTMLDivElement> {
  action: React.ReactNode;
  title?: string;
  message?: string;
  styleProps?: React.CSSProperties;
}

const EmptyCTA = React.forwardRef<HTMLDivElement, EmptyCTAProps>(
  ({ action, title, message, styleProps, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-xl p-12",
        "border border-border bg-muted-background",
        className
      )}
      style={styleProps}
      {...props}
    >
      {title && (
        <div
          className={cn("text-center text-sm font-medium", "text-foreground")}
        >
          {title}
        </div>
      )}
      {message && (
        <div className={cn("text-center text-sm", "text-muted-foreground")}>
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
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const EmptyCTAButton: React.FC<EmptyCTAButtonProps> = ({
  icon,
  label,
  variant = "highlight",
  ...props
}) => <Button icon={icon} label={label} variant={variant} {...props} />;

EmptyCTAButton.displayName = "EmptyCTAButton";

export { EmptyCTA, EmptyCTAButton };
