import {
  LegacyButton,
  type LegacyRegularButtonProps,
} from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

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
        "flex w-full flex-col items-center justify-center gap-2 rounded-xl p-12",
        "border border-border bg-muted-background",
        className
      )}
      style={styleProps}
      {...props}
    >
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

interface EmptyCTAButtonProps extends LegacyRegularButtonProps {
  icon: React.ComponentType;
  label: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const EmptyCTAButton: React.FC<EmptyCTAButtonProps> = ({
  icon,
  label,
  variant = "highlight",
  ...props
}) => <LegacyButton icon={icon} label={label} variant={variant} {...props} />;

EmptyCTAButton.displayName = "EmptyCTAButton";

export { EmptyCTA, EmptyCTAButton };
