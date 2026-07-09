import { Button, type ButtonProps } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import React from "react";

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
          {/* Opaque divider: the main button's hover/active overlay sits behind
              it, so a translucent line would visibly shift on hover. */}
          <div className="h-4 w-px bg-separator" />
          {clonedSplitAction}
        </span>
      </div>
    );
  }
);

FlexSplitButton.displayName = "FlexSplitButton";

export { FlexSplitButton };
