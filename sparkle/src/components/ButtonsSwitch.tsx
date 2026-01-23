import { cva, VariantProps } from "class-variance-authority";
import * as React from "react";

import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";

type ButtonSize = Extract<
  React.ComponentProps<typeof Button>["size"],
  "xs" | "sm" | "md"
>;

type ButtonsSwitchContextType = {
  value?: string;
  onValueChange?: (value: string) => void;
  size: ButtonSize;
  disabled?: boolean;
};

const ButtonsSwitchContext =
  React.createContext<ButtonsSwitchContextType | null>(null);

const useButtonsSwitch = () => {
  const ctx = React.useContext(ButtonsSwitchContext);
  if (!ctx) {
    throw new Error(
      "ButtonsSwitch must be used within a ButtonsSwitchList component"
    );
  }
  return ctx;
};

const listStyles = cva(
  cn(
    "s-inline-flex s-items-center s-gap-1",
    "s-bg-primary-100 dark:s-bg-primary-900"
  ),
  {
    variants: {
      fullWidth: {
        true: "s-w-full",
        false: "",
      },
      size: {
        xs: "s-rounded-lg s-p-0.5",
        sm: "s-rounded-xl s-p-1",
        md: "s-rounded-2xl s-p-1.5",
      },
    },
    defaultVariants: {
      fullWidth: false,
      size: "sm",
    },
  }
);

export interface ButtonsSwitchListProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof listStyles> {
  size?: ButtonSize;
  disabled?: boolean;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export const ButtonsSwitchList = React.forwardRef<
  HTMLDivElement,
  ButtonsSwitchListProps
>(
  (
    {
      className,
      children,
      size = "sm",
      defaultValue,
      onValueChange,
      disabled,
      fullWidth,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<
      string | undefined
    >(defaultValue);

    const selected = internalValue;

    const handleChange = React.useCallback(
      (next: string) => {
        setInternalValue(next);
        onValueChange?.(next);
      },
      [onValueChange]
    );

    const context: ButtonsSwitchContextType = React.useMemo(
      () => ({ value: selected, onValueChange: handleChange, size, disabled }),
      [selected, handleChange, size, disabled]
    );

    return (
      <div
        ref={ref}
        role="tablist"
        aria-orientation="horizontal"
        className={cn(listStyles({ fullWidth, size }), className)}
        {...props}
      >
        <ButtonsSwitchContext.Provider value={context}>
          {children}
        </ButtonsSwitchContext.Provider>
      </div>
    );
  }
);
ButtonsSwitchList.displayName = "ButtonsSwitchList";

interface ButtonsSwitchProps extends Omit<
  React.ComponentProps<typeof Button>,
  "size" | "variant"
> {
  value: string;
  label?: string;
  icon?: React.ComponentProps<typeof Button>["icon"];
}

export const ButtonsSwitch = React.forwardRef<
  HTMLButtonElement,
  ButtonsSwitchProps
>(({ className, value, label, icon, disabled, onClick, ...props }, ref) => {
  const {
    value: selected,
    onValueChange,
    size,
    disabled: groupDisabled,
  } = useButtonsSwitch();

  const isActive = selected === value;
  const isDisabled = disabled || groupDisabled;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (isDisabled) {
      return;
    }
    onValueChange?.(value);
    onClick?.(e);
  };

  return (
    <Button
      ref={ref}
      role="tab"
      aria-selected={isActive}
      size={size}
      variant={isActive ? "outline" : "ghost-secondary"}
      label={label}
      icon={icon}
      className={className}
      disabled={isDisabled}
      onClick={handleClick}
      {...props}
    />
  );
});
ButtonsSwitch.displayName = "ButtonsSwitch";

export default ButtonsSwitch;
