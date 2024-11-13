import { cva } from "class-variance-authority";
import React, { useState } from "react";

import {
  Button,
  ButtonSizeType,
  MetaButtonProps,
} from "@sparkle/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
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
}

export interface SplitButtonProps extends Omit<MetaButtonProps, "children"> {
  actions: SplitButtonActionProps[];
  defaultAction: SplitButtonActionProps;
}

export const SplitButton = React.forwardRef<
  HTMLButtonElement,
  SplitButtonProps
>(({ actions, className, size, variant, disabled, ...props }, ref) => {
  const [current, setCurrent] = useState(props.defaultAction);
  return (
    <div className="s-flex s-items-center">
      <Button
        {...props}
        size={size}
        variant={variant}
        label={current.label}
        icon={current.icon}
        disabled={disabled || current.disabled}
        onClick={(e) => current.onClick && current.onClick(e)}
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
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((action, index) => (
            <DropdownMenuItem
              key={index}
              label={action.label}
              icon={action.icon}
              disabled={action.disabled}
              onClick={() => setCurrent(action)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
