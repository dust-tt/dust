import React from "react";

import { ButtonProps } from "@sparkle/components/";
import { Button, ButtonVariantType } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib";

const flexSeparatorVariants: Record<ButtonVariantType, string> = {
  primary: "s-bg-background/50 dark:s-text-background-night/50",
  highlight: "s-bg-background/50 dark:s-text-background-night/50",
  "highlight-secondary": "s-bg-separator dark:s-bg-separator-night",
  warning: "s-bg-background/50 dark:s-text-background-night/50",
  "warning-secondary": "s-bg-separator dark:s-bg-separator-night",
  outline: "s-bg-separator dark:s-bg-separator-night",
  ghost: "s-bg-separator dark:s-bg-separator-night",
  "ghost-secondary": "s-bg-separator dark:s-bg-separator-night",
};

export interface FlexSplitButtonProps extends Omit<ButtonProps, "size"> {
  containerClassName?: string;
  splitAction: React.ReactElement<React.ComponentProps<typeof Button>>;
}

const FlexSplitButton = React.forwardRef<
  HTMLButtonElement,
  FlexSplitButtonProps
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
      <div className={cn("s-relative s-inline-block", containerClassName)}>
        <Button
          ref={ref}
          variant={variant}
          size="sm"
          className={cn(className, "s-pr-12")}
          isLoading={isLoading}
          {...buttonProps}
        />
        <span className="s-absolute s-right-1 s-top-1 s-flex s-items-center s-gap-1">
          <div className={cn("s-h-4 s-w-px", separatorStyle)} />
          {clonedSplitAction}
        </span>
      </div>
    );
  }
);

FlexSplitButton.displayName = "FlexSplitButton";

export { FlexSplitButton };
