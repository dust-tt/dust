import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { Icon, Spinner } from "@sparkle/index_with_tw_base";
import { classNames } from "@sparkle/lib/utils";

const buttonVariants = cva(
  "s-inline-flex s-items-center s-justify-center s-whitespace-nowrap s-font-medium s-ring-offset-background s-transition-colors s-duration-100 focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2 disabled:s-pointer-events-none disabled:s-opacity-50",
  {
    variants: {
      variant: {
        primary:
          "s-bg-primary-800 s-text-primary-50 hover:s-bg-primary-600 active:s-bg-primary-900",
        highlight:
          "s-bg-action-500 s-text-white hover:s-bg-action-400 active:s-bg-action-600",
        warning:
          "s-bg-warning-500 s-text-white hover:s-bg-warning-400 active:s-bg-warning-600",
        outline:
          "s-border s-text-primary-950 s-border-primary-300 s-bg-background hover:s-bg-primary-100 active:s-bg-primary-300",
        secondary:
          "s-bg-primary-200 s-text-primary-950 hover:s-bg-primary-100 active:s-bg-primary-200",
        ghost: "hover:s-bg-primary-100 active:s-bg-primary-200",
      },
      size: {
        xs: "s-h-7 s-px-2.5 s-rounded s-text-xs s-gap-1",
        sm: "s-h-9 s-px-3 s-rounded-md s-text-sm s-gap-1.5",
        md: "s-h-12 s-px-4 s-py-2 s-rounded-lg s-text-base s-gap-2",
        icon: "s-h-10 s-w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
);

interface ButtonProps extends MetaButtonProps {
  label?: string;
  icon?: React.ComponentType;
  isLoading?: boolean;
}

// Map button variants to spinner variants
const spinnerVariantsMap = {
  primary: "light",
  highlight: "light",
  warning: "light",
  outline: "dark",
  secondary: "dark",
  ghost: "dark",
};

interface ButtonProps extends MetaButtonProps {
  label?: string;
  icon?: React.ComponentType;
  isLoading?: boolean;
}

export const NewButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ label, icon, isLoading = false, variant = "primary", ...props }, ref) => {
    const hasIcon = Boolean(icon);

    const spinnerVariant =
      spinnerVariantsMap[variant as keyof typeof spinnerVariantsMap] || "color";

    const content = isLoading ? (
      <>
        <Spinner
          size={props.size as "xs" | "sm" | "md"}
          variant={spinnerVariant}
        />
        {label}
      </>
    ) : (
      <>
        {hasIcon && (
          <Icon visual={icon} size={props.size as "xs" | "sm" | "md"} />
        )}
        {label}
      </>
    );

    return (
      <MetaButton
        ref={ref}
        variant={variant}
        disabled={isLoading || props.disabled}
        hasVisual={hasIcon || isLoading ? true : false}
        {...props}
      >
        {content}
      </MetaButton>
    );
  }
);

NewButton.displayName = "NewButton";

export interface MetaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  hasVisual?: boolean;
}

const isIcon = (child: React.ReactNode): boolean => {
  return React.isValidElement(child) && child.type === Icon;
};

const MetaButton = React.forwardRef<HTMLButtonElement, MetaButtonProps>(
  (
    {
      className,
      variant,
      size = "sm",
      asChild = false,
      hasVisual = false,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    const paddingClasses: Record<"xs" | "sm" | "md", string> = {
      xs: hasVisual ? "s-pl-1.5" : "s-pl-2.5",
      sm: hasVisual ? "s-pl-2" : "s-pl-3",
      md: hasVisual ? "s-pl-3" : "s-pl-4",
    };

    const paddingClass = paddingClasses[size as "xs" | "sm" | "md"];

    // Clone children with icon size if the Icon accepts a size prop
    const modifiedChildren = React.Children.map(children, (child) =>
      React.isValidElement(child) && isIcon(child)
        ? React.cloneElement(child, { size } as React.ComponentProps<
            typeof Icon
          >)
        : child
    );

    return (
      <Comp
        className={classNames(
          buttonVariants({ variant, size }),
          paddingClass,
          className || ""
        )}
        ref={ref}
        {...props}
      >
        {modifiedChildren}
      </Comp>
    );
  }
);
MetaButton.displayName = "Button";

export { buttonVariants, MetaButton };
