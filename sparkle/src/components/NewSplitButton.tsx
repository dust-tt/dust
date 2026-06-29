import { NewButton, type NewButtonProps } from "@sparkle/components/NewButton";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface NewFlexSplitButtonProps extends Omit<NewButtonProps, "size"> {
  containerClassName?: string;
  splitAction: React.ReactElement<React.ComponentProps<typeof NewButton>>;
}

const NewFlexSplitButton = React.forwardRef<
  HTMLButtonElement,
  NewFlexSplitButtonProps
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
    // Disable the split action while the main button is loading.
    const clonedSplitAction = React.cloneElement(splitAction, {
      disabled: isLoading || splitAction.props.disabled,
    });

    return (
      <div className={cn("s-relative s-inline-block", containerClassName)}>
        <NewButton
          ref={ref}
          variant={variant}
          size="sm"
          className={cn(className, "s-pr-12")}
          isLoading={isLoading}
          {...buttonProps}
        />
        <span className="s-absolute s-right-1 s-top-1 s-flex s-items-center s-gap-1">
          {/* Opaque divider: the main button's hover/active overlay sits behind
              it, so a translucent line would visibly shift on hover. */}
          <div className="s-h-4 s-w-px s-bg-separator dark:s-bg-separator-night" />
          {clonedSplitAction}
        </span>
      </div>
    );
  }
);

NewFlexSplitButton.displayName = "NewFlexSplitButton";

export { NewFlexSplitButton };
