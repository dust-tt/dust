import { cva } from "class-variance-authority";
import React, { useState } from "react";

import {
  ButtonProps,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RegularButtonProps,
} from "@sparkle/components/";
import {
  Button,
  ButtonSizeType,
  ButtonVariantType,
} from "@sparkle/components/Button";
import { Separator } from "@sparkle/components/Separator";
import { ChevronDownIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib";

const separatorSizeVariants: Record<Exclude<ButtonSizeType, "mini">, string> = {
  xs: "s-h-3",
  sm: "s-h-5",
  md: "s-h-7",
};

const separatorVariants = cva("s--ml-[1px]", {
  variants: {
    size: separatorSizeVariants,
  },
});

interface SplitButtonActionProps {
  label: string;
  icon?: React.ComponentType;
  tooltip?: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  isLoading?: boolean;
}

export interface SplitButtonProps
  extends Omit<RegularButtonProps, "children" | "onClick"> {
  /**
   * List of possible actions, will be displayed in dropdown
   */
  actions: SplitButtonActionProps[];

  /**
   * Current action to use (controlled mode)
   */
  action?: SplitButtonActionProps;

  /**
   * default action to use in uncontrolled mode. If not specified, the first action will be used.
   */
  defaultAction?: SplitButtonActionProps;

  /**
   * Event handler for action change
   */
  onActionChange?: (action: SplitButtonActionProps) => void;
}

const SplitButton = React.forwardRef<HTMLButtonElement, SplitButtonProps>(
  (
    {
      actions,
      className,
      size,
      variant,
      disabled,
      action,
      defaultAction,
      onActionChange,
      ...props
    },
    ref
  ) => {
    // If there are no actions, do not display anything
    if (actions.length === 0) {
      return null;
    }

    // Local state in uncontrolled mode, set to defaultAction or first action
    const [localAction, setLocalAction] = useState(defaultAction ?? actions[0]);

    // Override and ignore if controlled
    const actionToUse = action ?? localAction;

    return (
      <div className="s-flex s-items-center">
        <Button
          {...props}
          size={size || undefined}
          variant={variant}
          label={actionToUse.label}
          icon={actionToUse.icon}
          disabled={disabled || actionToUse.disabled}
          onClick={(e) => actionToUse.onClick && actionToUse.onClick(e)}
          ref={ref}
          className={cn("s-rounded-r-none s-border-r-0", className)}
        />
        <div className={separatorVariants({ size })}>
          <Separator orientation="vertical" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              {...props}
              size={size || undefined}
              variant={variant}
              icon={ChevronDownIcon}
              disabled={disabled}
              className={cn("s-rounded-l-none s-border-l-0", className)}
              isLoading={actionToUse.isLoading}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action, index) => (
              <DropdownMenuItem
                key={index}
                label={action.label}
                icon={action.icon}
                disabled={action.disabled}
                onClick={() => {
                  setLocalAction(action);
                  if (onActionChange) {
                    onActionChange(action);
                  }
                }}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
);

const flexSeparatorVariants: Record<ButtonVariantType, string> = {
  primary: "s-bg-white/50 dark:s-bg-muted-background-night/50",
  highlight: "s-bg-white/50 dark:s-bg-muted-background-night/50",
  warning: "s-bg-white/50 dark:s-bg-muted-background-night/50",
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
    { splitAction, containerClassName, variant, className, ...buttonProps },
    ref
  ) => {
    const separatorStyle = variant
      ? flexSeparatorVariants[variant]
      : flexSeparatorVariants.primary;
    return (
      <div className={cn("s-relative s-inline-block", containerClassName)}>
        <Button
          ref={ref}
          variant={variant}
          size="sm"
          className={cn(className, "s-pr-12")}
          {...buttonProps}
        />
        <span className="s-absolute s-right-1 s-top-1 s-flex s-items-center s-gap-1">
          <div className={cn("s-h-4 s-w-px", separatorStyle)} />
          {splitAction}
        </span>
      </div>
    );
  }
);

FlexSplitButton.displayName = "FlexSplitButton";

export { FlexSplitButton, SplitButton };
