import { cva } from "class-variance-authority";
import React, { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparkle/components/";
import {
  Button,
  ButtonSizeType,
  MetaButtonProps,
} from "@sparkle/components/Button";
import { Separator } from "@sparkle/components/Separator";
import { ChevronDownIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib";

const separatorSizeVariants: Record<ButtonSizeType, string> = {
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
  extends Omit<MetaButtonProps, "children" | "onClick" | "size"> {
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
  size: ButtonSizeType;
}

export const SplitButton = React.forwardRef<
  HTMLButtonElement,
  SplitButtonProps
>(
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
          size={size}
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
              size={size}
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
