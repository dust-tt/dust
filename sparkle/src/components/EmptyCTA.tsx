import { Button, type RegularButtonProps } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

interface EmptyCTAProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Call-to-action slot — typically an EmptyCTAButton letting the user create the first item. */
  action: React.ReactNode;
  title?: string;
  /** Short text explaining what's missing; let the action describe the next step. */
  message?: string;
  /** Inline styles applied to the container. */
  styleProps?: React.CSSProperties;
}

/**
 * An empty-state placeholder that explains why a region has no content and
 * offers a way forward via an action slot. Use it when a list, table, or
 * section has no data yet and you want to guide the user toward populating
 * it; for a transient loading placeholder, use a LoadingBlock skeleton
 * instead.
 * @summary Empty-state placeholder with call to action.
 */
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

/** Highlight-variant Button preset for the primary action of an EmptyCTA. */
const EmptyCTAButton: React.FC<EmptyCTAButtonProps> = ({
  icon,
  label,
  variant = "highlight",
  ...props
}) => <Button icon={icon} label={label} variant={variant} {...props} />;

EmptyCTAButton.displayName = "EmptyCTAButton";

export { EmptyCTA, EmptyCTAButton };
