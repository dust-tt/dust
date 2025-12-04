import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

import type { ButtonProps, ButtonSizeType, ButtonVariantType } from "./Button";
import { Button } from "./Button";
import type { DropdownMenuItemProps } from "./Dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./Dropdown";

type ButtonGroupButtonItem = {
  type: "button";
  props: ButtonProps;
};

type ButtonGroupDropdownItem = {
  type: "dropdown";
  triggerProps: Omit<ButtonProps, "onClick">;
  dropdownProps: {
    items: DropdownMenuItemProps[];
    align?: "start" | "center" | "end";
  };
};

export type ButtonGroupItem = ButtonGroupButtonItem | ButtonGroupDropdownItem;

type DisallowedButtonGroupVariant =
  | "ghost"
  | "ghost-secondary"
  | "highlight"
  | "warning";

export type ButtonGroupVariantType = Exclude<
  ButtonVariantType,
  DisallowedButtonGroupVariant
>;

const DISALLOWED_VARIANTS = new Set<ButtonVariantType>([
  "ghost",
  "ghost-secondary",
  "highlight",
  "warning",
]);

const sanitizeVariant = (
  variant?: ButtonVariantType | null
): ButtonGroupVariantType => {
  if (!variant) {
    return "outline";
  }
  if (DISALLOWED_VARIANTS.has(variant)) {
    if (
      process.env.NODE_ENV !== "production" &&
      typeof console !== "undefined"
    ) {
      console.warn(
        `[ButtonGroup] Variant "${variant}" is not allowed. Falling back to "outline".`
      );
    }
    return "outline";
  }
  return variant as ButtonGroupVariantType;
};

const buttonGroupVariants = cva("s-inline-flex", {
  variants: {
    orientation: {
      horizontal: "s-flex-row",
      vertical: "s-flex-col",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export interface ButtonGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
    VariantProps<typeof buttonGroupVariants> {
  /**
   * Array of button or dropdown items to render in the group.
   */
  items: ButtonGroupItem[];
  /**
   * Variant to apply to all buttons in the group.
   */
  variant?: ButtonGroupVariantType;
  /**
   * Size to apply to all buttons in the group. Mini buttons must opt-in per item.
   */
  size?: Exclude<ButtonSizeType, "mini">;
  /**
   * Whether every button should be disabled.
   */
  disabled?: boolean;
  /**
   * Remove gaps and merge borders (segmented-control look).
   */
  removeGaps?: boolean;
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  (
    {
      className,
      orientation = "horizontal",
      variant,
      size,
      disabled,
      removeGaps = true,
      items,
      ...props
    },
    ref
  ) => {
    if (!items || items.length === 0) {
      return null;
    }

    const totalItems = items.length;

    const renderedItems = items.map((item, index) => {
      const isFirst = index === 0;
      const isLast = index === totalItems - 1;

      const borderRadiusClasses = (() => {
        if (!removeGaps || totalItems === 1) {
          return "";
        }

        if (orientation === "horizontal") {
          if (isFirst) {
            return "!s-rounded-r-none";
          }
          if (isLast) {
            return "!s-rounded-l-none";
          }
          return "!s-rounded-none";
        }

        if (isFirst) {
          return "!s-rounded-b-none";
        }
        if (isLast) {
          return "!s-rounded-t-none";
        }
        return "!s-rounded-none";
      })();

      const borderClasses = (() => {
        if (!removeGaps) {
          return "";
        }

        if (orientation === "horizontal") {
          return isLast ? "" : "s-border-r-0";
        }

        return isLast ? "" : "s-border-b-0";
      })();

      if (item.type === "button") {
        const nextVariant = sanitizeVariant(variant ?? item.props.variant);
        const rawSize = size ?? item.props.size;
        const nextSize: Exclude<ButtonSizeType, "mini"> | undefined =
          rawSize === "mini"
            ? undefined
            : (rawSize as Exclude<ButtonSizeType, "mini"> | undefined);

        return (
          <Button
            key={index}
            {...item.props}
            variant={nextVariant}
            size={nextSize}
            disabled={disabled ?? item.props.disabled}
            isRounded={false}
            className={cn(
              item.props.className,
              borderRadiusClasses,
              borderClasses
            )}
          />
        );
      }

      const nextVariant = sanitizeVariant(variant ?? item.triggerProps.variant);
      const rawSize = size ?? item.triggerProps.size;
      const nextSize: Exclude<ButtonSizeType, "mini"> | undefined =
        rawSize === "mini"
          ? undefined
          : (rawSize as Exclude<ButtonSizeType, "mini"> | undefined);

      return (
        <DropdownMenu key={index}>
          <DropdownMenuTrigger asChild>
            <Button
              {...item.triggerProps}
              variant={nextVariant}
              size={nextSize}
              disabled={disabled ?? item.triggerProps.disabled}
              isRounded={false}
              className={cn(
                item.triggerProps.className,
                borderRadiusClasses,
                borderClasses
              )}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align={item.dropdownProps.align ?? "center"}>
            {item.dropdownProps.items.map((dropdownItem, dropdownIndex) => (
              <DropdownMenuItem key={dropdownIndex} {...dropdownItem} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    });

    return (
      <div
        ref={ref}
        className={cn(
          buttonGroupVariants({ orientation }),
          removeGaps ? "s-gap-0" : "s-gap-2",
          className
        )}
        role="group"
        {...props}
      >
        {renderedItems}
      </div>
    );
  }
);

ButtonGroup.displayName = "ButtonGroup";

export { ButtonGroup, buttonGroupVariants };
