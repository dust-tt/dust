import { Button, type ButtonProps } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface FlexSplitButtonProps extends Omit<ButtonProps, "size"> {
  /** className applied to the wrapping container rather than the main button. */
  containerClassName?: string;
  /** Secondary Button element attached after the divider — typically an icon-only `xs` chevron opening a menu; disabled automatically while `isLoading`. */
  splitAction: React.ReactElement<React.ComponentProps<typeof Button>>;
}

/**
 * A primary action paired with an attached secondary affordance: a labelled `Button`
 * joined to a `splitAction` — typically a chevron button that opens a menu of related
 * options. Use it when one action is the obvious default but a few related variants
 * should be one click away (e.g. "Send" + send options), matching the `variant` of both
 * buttons so they read as one control.
 *
 * @summary Split button with attached secondary action.
 */
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
