import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

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
    "inline-flex items-center gap-1",
    "box-border bg-background border border-border-dark"
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
  /** Disable every option in the switch. */
  disabled?: boolean;
  /** Selected option's value (controlled usage). */
  value?: string;
  /** Initially selected option's value (uncontrolled usage). */
  defaultValue?: string;
  /** Invoked with the newly selected option's value. */
  onValueChange?: (value: string) => void;
}

/**
 * The container of a segmented, single-select toggle: it owns the selected value
 * (controlled via `value`/`onValueChange` or uncontrolled via `defaultValue`) for
 * its ButtonsSwitch children. Use it to switch between a small set of mutually
 * exclusive views or modes; for triggering actions, use Button or ButtonGroup.
 * @summary Segmented single-select toggle container.
 */
export const ButtonsSwitchList = React.forwardRef<
  HTMLDivElement,
  ButtonsSwitchListProps
>(
  (
    {
      className,
      children,
      size = "sm",
      value,
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

    const isControlled = value !== undefined;
    const selected = isControlled ? value : internalValue;

    const handleChange = React.useCallback(
      (next: string) => {
        if (!isControlled) {
          setInternalValue(next);
        }
        onValueChange?.(next);
      },
      [isControlled, onValueChange]
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
  extends Omit<React.ComponentProps<typeof Button>, "size" | "variant"> {
  /** Unique value identifying this option within the list. */
  value: string;
  label?: string;
  icon?: React.ComponentProps<typeof Button>["icon"];
}

/**
 * One option of a segmented toggle, identified by its `value` and rendered with a
 * `label`. Must be rendered inside a ButtonsSwitchList, which manages selection.
 * @summary Single option of a ButtonsSwitchList.
 */
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
      variant={isActive ? "outline" : "ghost"}
      label={label}
      icon={icon}
      className={cn(!isActive && "border border-transparent", className)}
      disabled={isDisabled}
      onClick={handleClick}
      {...props}
    />
  );
});
ButtonsSwitch.displayName = "ButtonsSwitch";
