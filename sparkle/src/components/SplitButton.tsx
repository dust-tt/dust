import type { LegacyButtonProps } from "@sparkle/components/Button";
import {
  LegacyButton,
  type LegacyButtonVariantType,
} from "@sparkle/components/Button";
import { cn } from "@sparkle/lib";
import React from "react";

const flexSeparatorVariants: Record<LegacyButtonVariantType, string> = {
  primary: "bg-background/50",
  highlight: "bg-background/50",
  "highlight-secondary": "bg-separator",
  warning: "bg-background/50",
  "warning-secondary": "bg-separator",
  outline: "bg-separator",
  ghost: "bg-separator",
  "ghost-secondary": "bg-separator",
};

export interface FlexSplitButtonProps extends Omit<LegacyButtonProps, "size"> {
  containerClassName?: string;
  splitAction: React.ReactElement<React.ComponentProps<typeof LegacyButton>>;
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
      <div className={cn("relative inline-block", containerClassName)}>
        <LegacyButton
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

FlexSplitButton.displayName = "FlexSplitButton";

export { FlexSplitButton };
