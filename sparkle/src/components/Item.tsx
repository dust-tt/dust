import React, { MouseEvent, ComponentType } from "react";
import { classNames } from "@sparkle/lib/utils";
import { Icon } from "./Icon";
import { ChevronRight } from "@sparkle/icons/mini";

type ItemProps = {
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  size?: "sm" | "md";
  selected?: boolean;
  disabled?: boolean;
  label: string;
  icon?: ComponentType;
  className?: string;
};

const baseClasses =
  "group inline-flex transition-color ease-out duration-400 box-border gap-x-2 py-3 text-sm font-semibold";

const iconBaseClasses = "h-5 w-5 transition-color ease-out duration-400";

const iconClasses = {
  default: {
    base: "h-5 w-5 text-element-700",
    hover: "group-hover:text-action-400",
    dark: {
      base: "dark:text-element-600-dark",
      hover: "dark:group-hover:text-action-500-dark",
    },
  },
  selected: {
    base: "text-action-500",
    hover: "",
    dark: {
      base: "dark:text-action-500-dark",
      hover: "",
    },
  },
};

const stateClasses = {
  default: {
    base: "text-element-900 cursor-pointer",
    hover: "hover:text-action-500",
    active: "active:text-action-700",
    dark: {
      base: "dark:bg-action-500-dark dark:border-action-600-dark",
      hover: "dark:hover:bg-action-500-dark dark:hover:border-action-500-dark",
      active:
        "dark:active:bg-action-600-dark dark:active:border-action-700-dark",
    },
    disabled: "cursor-not-allowed opacity-50 bg-gray-200",
  },
  selected: {
    base: "bg-action-500 border-action-600 text-white cursor-default",
    dark: {
      base: "dark:bg-action-500-dark dark:border-action-600-dark",
    },
  },
};

export function Item({
  onClick,
  selected = false,
  disabled = false,
  label,
  icon,
  className = "",
}: ItemProps) {
  const currentStateClasses = selected
    ? stateClasses.selected
    : stateClasses.default;

  const itemClasses = classNames(
    baseClasses,
    currentStateClasses.base,
    currentStateClasses.dark?.base,
    disabled ? currentStateClasses.disabled : "",
    !selected && !disabled ? currentStateClasses.hover : "",
    !selected && !disabled ? currentStateClasses.dark?.hover : "",
    !selected && !disabled ? currentStateClasses.active : "",
    !selected && !disabled ? currentStateClasses.dark?.active : "",
    className
  );

  const currentIconClasses = selected
    ? iconClasses.selected
    : iconClasses.default;

  const finalIconClasses = classNames(
    iconBaseClasses,
    currentIconClasses.base,
    currentIconClasses.hover,
    currentIconClasses.dark.base,
    currentIconClasses.dark.hover
  );

  return (
    <div
      className={itemClasses}
      onClick={selected || disabled ? undefined : onClick}
      aria-label={label}
    >
      {icon && <Icon IconComponent={icon} className={finalIconClasses} />}
      <span className="grow">{label}</span>
      <Icon IconComponent={ChevronRight} className={finalIconClasses} />
    </div>
  );
}
