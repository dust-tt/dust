import { Button, type ButtonProps } from "@dust-tt/sparkle";
import type { ComponentType, Key } from "react";

interface FreeButtonSwitchOption<TValue extends string> {
  id?: Key;
  value: TValue;
  label?: string;
  icon?: ComponentType;
  tooltip?: string;
}

type FreeButtonSwitchSize = "xmini" | "mini" | "xs" | "sm" | "md";

interface FreeButtonSwitchProps<TValue extends string> {
  value: TValue;
  options: FreeButtonSwitchOption<TValue>[];
  onValueChange: (value: TValue) => void;
  size?: FreeButtonSwitchSize;
  activeVariant?: ButtonProps["variant"];
  inactiveVariant?: ButtonProps["variant"];
}

export function FreeButtonSwitch<TValue extends string>({
  value,
  options,
  onValueChange,
  size = "sm",
  activeVariant = "outline",
  inactiveVariant = "ghost-secondary",
}: FreeButtonSwitchProps<TValue>) {
  return (
    <div className="s-flex s-items-center s-gap-1">
      {options.map((option) => (
        <Button
          key={option.id ?? option.value}
          variant={option.value === value ? activeVariant : inactiveVariant}
          size={size}
          label={option.label}
          icon={option.icon}
          tooltip={option.tooltip}
          onClick={() => onValueChange(option.value)}
        />
      ))}
    </div>
  );
}
