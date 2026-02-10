/** biome-ignore-all lint/nursery/noImportCycles: I'm too lazy to fix that now */

import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import type { DropdownMenuItemProps } from "./Dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./Dropdown";

const buttonGroupVariants = cva("s-inline-flex s-w-fit s-items-stretch", {
  variants: {
    orientation: {
      horizontal: "s-flex-row",
      vertical: "s-flex-col",
    },
    removeGaps: {
      true: "",
      false: "s-gap-2",
    },
  },
  compoundVariants: [
    {
      orientation: "horizontal",
      removeGaps: true,
      className: cn(
        "s-gap-0",
        "[&>*:not(:first-child)]:!s-rounded-l-none",
        "[&>*:not(:first-child)]:s-border-l-0",
        "[&>*:not(:last-child)]:!s-rounded-r-none"
      ),
    },
    {
      orientation: "vertical",
      removeGaps: true,
      className: cn(
        "s-gap-0",
        "[&>*:not(:first-child)]:!s-rounded-t-none",
        "[&>*:not(:first-child)]:s-border-t-0",
        "[&>*:not(:last-child)]:!s-rounded-b-none"
      ),
    },
  ],
  defaultVariants: {
    orientation: "horizontal",
    removeGaps: true,
  },
});

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof buttonGroupVariants> {
  disabled?: boolean;
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  (
    { className, orientation = "horizontal", removeGaps = true, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        role="group"
        data-orientation={orientation}
        className={cn(
          buttonGroupVariants({ orientation, removeGaps }),
          className
        )}
        {...props}
      />
    );
  }
);

ButtonGroup.displayName = "ButtonGroup";

interface ButtonGroupDropdownProps {
  trigger: React.ReactElement;
  items: DropdownMenuItemProps[];
  align?: "start" | "center" | "end";
}

function ButtonGroupDropdown({
  trigger,
  items,
  align = "center",
}: ButtonGroupDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item, index) => (
          <DropdownMenuItem key={index} {...item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ButtonGroup, ButtonGroupDropdown, buttonGroupVariants };
