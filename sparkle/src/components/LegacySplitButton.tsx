import type { ButtonProps } from "@sparkle/components/LegacyButton";
import {
  Button,
  type ButtonVariantType,
} from "@sparkle/components/LegacyButton";
import { cn } from "@sparkle/lib";
import React from "react";

const flexSeparatorVariants: Record<ButtonVariantType, string> = {
  primary: "bg-background/50",
  highlight: "bg-background/50",
  "highlight-secondary": "bg-separator",
  warning: "bg-background/50",
  "warning-secondary": "bg-separator",
  outline: "bg-separator",
  ghost: "bg-separator",
  "ghost-secondary": "bg-separator",
};

export interface LegacyFlexSplitButtonProps extends Omit<ButtonProps, "size"> {
  containerClassName?: string;
  splitAction: React.ReactElement<React.ComponentProps<typeof Button>>;
}

const LegacyFlexSplitButton = React.forwardRef<
  HTMLButtonElement,
  LegacyFlexSplitButtonProps
>(
  (
    {
      splitAction,
      containerClassName,
      variant,
      className,
      isLoading,
      ...buttonProps
    },
    ref
  ) => {
    const separatorStyle = variant
      ? flexSeparatorVariants[variant]
      : flexSeparatorVariants.primary;

    // Clone the splitAction and disable it when main button is loading
    const clonedSplitAction = React.cloneElement(splitAction, {
      disabled: isLoading || splitAction.props.disabled,
    });

    return (
      <div className={cn("relative inline-block", containerClassName)}>
        <Button
          ref={ref}
          variant={variant}
          size="sm"
          className={cn(className, "pr-12")}
          isLoading={isLoading}
          {...buttonProps}
        />
        <span className="absolute right-1 top-1 flex items-center gap-1">
          <div className={cn("h-4 w-px", separatorStyle)} />
          {clonedSplitAction}
        </span>
      </div>
    );
  }
);

LegacyFlexSplitButton.displayName = "LegacyFlexSplitButton";

export { LegacyFlexSplitButton };
