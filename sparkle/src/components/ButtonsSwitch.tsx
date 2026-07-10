import { LegacyButton } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

type ButtonSize = Extract<
  React.ComponentProps<typeof LegacyButton>["size"],
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
    "inline-flex items-center gap-1",
    "box-border bg-muted border border-border"
  ),
  {
    variants: {
      fullWidth: {
        true: "w-full",
        false: "",
      },
      size: {
        xs: "rounded-xl p-[3px]",
        sm: "rounded-2xl p-1",
        md: "rounded-3xl p-1.5",
      },
    },
    defaultVariants: {
      fullWidth: false,
      size: "sm",
    },
  }
);

export interface ButtonsSwitchListProps
  extends React.HTMLAttributes<HTMLDivElement>,
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

interface ButtonsSwitchProps
  extends Omit<React.ComponentProps<typeof LegacyButton>, "size" | "variant"> {
  value: string;
  label?: string;
  icon?: React.ComponentProps<typeof LegacyButton>["icon"];
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
    <LegacyButton
      ref={ref}
      role="tab"
      aria-selected={isActive}
      size={size}
      variant={isActive ? "outline" : "ghost"}
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
