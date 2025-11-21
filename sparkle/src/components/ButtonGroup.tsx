import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

import type { ButtonProps, ButtonSizeType, ButtonVariantType } from "./Button";

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
  children: React.ReactElement<ButtonProps> | React.ReactElement<ButtonProps>[];
  /**
   * Variant to apply to all buttons in the group.
   */
  variant?: ButtonGroupVariantType;
  /**
   * Size to apply to all buttons in the group. Mini buttons must opt-in per child.
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
      children,
      ...props
    },
    ref
  ) => {
    const childrenArray = React.Children.toArray(
      children
    ) as React.ReactElement<ButtonProps>[];

    const clonedChildren = childrenArray.map((child, index) => {
      if (!React.isValidElement<ButtonProps>(child)) {
        return child;
      }

      const totalChildren = childrenArray.length;
      const isFirst = index === 0;
      const isLast = index === totalChildren - 1;

      const borderRadiusClasses = (() => {
        if (!removeGaps || totalChildren === 1) {
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

      const nextVariant = sanitizeVariant(variant ?? child.props.variant);
      const nextSize = (size ?? child.props.size) as ButtonProps["size"];

      const overrides = {
        variant: nextVariant,
        size: nextSize,
        disabled: disabled ?? child.props.disabled,
        isRounded: false,
        className: cn(
          child.props.className,
          borderRadiusClasses,
          borderClasses
        ),
      } as Partial<ButtonProps>;

      return React.cloneElement(child, overrides);
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
        {clonedChildren}
      </div>
    );
  }
);

ButtonGroup.displayName = "ButtonGroup";

export { ButtonGroup, buttonGroupVariants };
