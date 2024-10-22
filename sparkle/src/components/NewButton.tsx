import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import {
  Icon,
  Spinner,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components";
import { SpinnerProps } from "@sparkle/components/Spinner";
import { ChevronDownIcon } from "@sparkle/icons";
import { classNames, cn } from "@sparkle/lib/utils";

// Existing button variants
const buttonVariants = cva(
  "s-inline-flex s-items-center s-justify-center s-whitespace-nowrap s-font-medium s-ring-offset-background s-transition-colors focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2 disabled:s-pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "s-bg-primary s-text-white hover:s-bg-primary-light active:s-bg-primary-dark disabled:s-bg-primary-muted",
        highlight:
          "s-bg-highlight s-text-white hover:s-bg-highlight-light active:s-bg-highlight-dark disabled:s-bg-highlight-muted",
        warning:
          "s-bg-warning s-text-white hover:s-bg-warning-light active:s-bg-warning-dark  disabled:s-bg-warning-muted",
        outline:
          "s-border s-text-primary-dark s-border-border-dark s-bg-background hover:s-text-primary hover:s-bg-primary-100 hover:s-border-primary-200 active:s-bg-primary-300 disabled:s-text-primary-muted disabled:s-border-structure-100",
        ghost:
          "s-border s-border-primary-200/0 s-text-primary-950 hover:s-bg-primary-100 hover:s-text-primary-900 active:s-bg-primary-200 hover:s-border-primary-200 disabled:s-text-primary-400",
        // "ghost-secondary":
        //   "s-border s-border-primary-200/0 s-text-muted-foreground hover:s-text-primary-600 hover:s-bg-primary-100 active:s-bg-primary-200 hover:s-border-primary-200 disabled:s-text-primary-400",
      },
      size: {
        xs: "s-h-7 s-px-2.5 s-rounded-lg s-text-xs s-gap-1.5",
        sm: "s-h-9 s-px-3 s-rounded-xl s-text-sm s-gap-2",
        md: "s-h-12 s-px-4 s-py-2 s-rounded-2xl s-text-base s-gap-2.5",
        icon: "s-h-10 s-w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
);

type SpinnerVariant = NonNullable<SpinnerProps["variant"]>;

const spinnerVariantsMap: Record<string, SpinnerVariant> = {
  primary: "light",
  highlight: "light",
  warning: "light",
  outline: "dark",
  secondary: "dark",
  ghost: "dark",
};

const spinnerVariantsMapIsLoading: Record<string, SpinnerVariant> = {
  primary: "light",
  highlight: "light",
  warning: "light",
  outline: "slate400",
  secondary: "slate400",
  ghost: "slate400",
};

interface NewButtonProps extends MetaButtonProps {
  label?: string;
  icon?: React.ComponentType;
  isSelect?: boolean;
  isLoading?: boolean;
  isPulsing?: boolean;
  tooltip?: string; // Added tooltip prop
}

export const NewButton = React.forwardRef<HTMLButtonElement, NewButtonProps>(
  (
    {
      label,
      icon,
      isLoading = false,
      variant = "primary",
      tooltip,
      isSelect = false,
      isPulsing = false,
      ...props
    },
    ref
  ) => {
    const hasIcon = Boolean(icon);

    let spinnerVariant;

    if (isLoading) {
      spinnerVariant =
        spinnerVariantsMapIsLoading[
          variant as keyof typeof spinnerVariantsMapIsLoading
        ] || "slate400";
    } else {
      spinnerVariant =
        spinnerVariantsMap[variant as keyof typeof spinnerVariantsMap] ||
        "slate400";
    }
    const content = isLoading ? (
      <>
        <div className="-s-mx-0.5">
          <Spinner
            size={props.size as "xs" | "sm" | "md"}
            variant={spinnerVariant}
          />
        </div>
        {label}
        {isSelect && <Icon visual={ChevronDownIcon} size="xs" />}
      </>
    ) : (
      <>
        {hasIcon && (
          <Icon
            visual={icon}
            size={props.size as "xs" | "sm" | "md"}
            className="-s-mx-0.5"
          />
        )}
        {label}
        {isSelect && (
          <Icon size="xs" visual={ChevronDownIcon} className="-s-mr-1" />
        )}
      </>
    );

    const buttonElement = (
      <MetaButton
        ref={ref}
        variant={variant}
        disabled={isLoading || props.disabled}
        hasVisual={hasIcon || isLoading ? true : false}
        {...props}
        className={isPulsing ? "s-animate-pulse" : ""}
        style={
          {
            "--pulse-color": "#93C5FD",
            "--duration": "1.5s",
          } as React.CSSProperties
        }
      >
        {content}
      </MetaButton>
    );

    return tooltip ? (
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger>{buttonElement}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    ) : (
      buttonElement
    );
  }
);

interface NewButtonBarProps {
  children: React.ReactNode;
  className?: string;
}

export const NewButtonBar: React.FC<NewButtonBarProps> = ({
  children,
  className,
}) => {
  return (
    <div className={cn("s-flex s-flex-row s-gap-2", className)}>{children}</div>
  );
};

export interface MetaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  hasVisual?: boolean;
}

const MetaButton = React.forwardRef<HTMLButtonElement, MetaButtonProps>(
  (
    { className, variant, size = "sm", asChild = false, children, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={classNames(
          buttonVariants({ variant, size }),
          className || ""
        )}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
MetaButton.displayName = "Button";

export { buttonVariants, MetaButton };
