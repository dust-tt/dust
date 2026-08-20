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

const buttonGroupVariants = cva("inline-flex w-fit items-stretch", {
  variants: {
    orientation: {
      horizontal: "flex-row",
      vertical: "flex-col",
    },
    removeGaps: {
      true: "",
      false: "gap-2",
    },
  },
  compoundVariants: [
    {
      orientation: "horizontal",
      removeGaps: true,
      className: cn(
        "gap-0",
        // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
        "[&>*:not(:first-child)]:rounded-l-none!",
        "[&>*:not(:first-child)]:border-l-0",
        // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
        "[&>*:not(:last-child)]:rounded-r-none!"
      ),
    },
    {
      orientation: "vertical",
      removeGaps: true,
      className: cn(
        "gap-0",
        // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
        "[&>*:not(:first-child)]:rounded-t-none!",
        "[&>*:not(:first-child)]:border-t-0",
        // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
        "[&>*:not(:last-child)]:rounded-b-none!"
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
  /** Disable all buttons in the group. */
  disabled?: boolean;
}

/**
 * Groups related Buttons into a single cohesive control, laid out horizontally or
 * vertically, optionally merging their borders into a segmented control
 * (`removeGaps`). Use it for closely related actions or a split button paired with
 * ButtonGroupDropdown; for a single button with an attached chevron menu, prefer
 * SplitButton (FlexSplitButton) instead.
 * @summary Cohesive group of buttons.
 */
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
  /** Element (typically a Button) that opens the menu. */
  trigger: React.ReactElement;
  /** Menu entries rendered as DropdownMenuItems. */
  items: DropdownMenuItemProps[];
  /** Menu alignment relative to the trigger. */
  align?: "start" | "center" | "end";
  /** Invoked when the menu opens or closes. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * A ButtonGroup child that attaches an overflow DropdownMenu to a trigger button,
 * e.g. the secondary half of a split button.
 * @summary Overflow menu for a ButtonGroup.
 */
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
