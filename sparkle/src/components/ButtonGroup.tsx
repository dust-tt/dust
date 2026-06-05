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
        // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
        "[&>*:not(:first-child)]:!s-rounded-l-none",
        "[&>*:not(:first-child)]:s-border-l-0",
        // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
        "[&>*:not(:last-child)]:!s-rounded-r-none"
      ),
    },
    {
      orientation: "vertical",
      removeGaps: true,
      className: cn(
        "s-gap-0",
        // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
        "[&>*:not(:first-child)]:!s-rounded-t-none",
        "[&>*:not(:first-child)]:s-border-t-0",
        // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
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

// Distributive Omit: DropdownMenuItemProps is a mutually-exclusive union, and a
// plain Omit would collapse it to its common keys. Separators are not supported
// here — use the dropdown primitives directly if you need one between items.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

interface ButtonGroupDropdownProps {
  trigger: React.ReactElement;
  items: DistributiveOmit<DropdownMenuItemProps, "separatorAfter">[];
  align?: "start" | "center" | "end";
  onOpenChange?: (open: boolean) => void;
}

function ButtonGroupDropdown({
  trigger,
  items,
  align = "center",
  onOpenChange,
}: ButtonGroupDropdownProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
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
