import React, { ComponentType, MouseEvent } from "react";

import {
  noHrefLink,
  SparkleContext,
  SparkleContextLinkType,
} from "@sparkle/context";
import { ChevronRight } from "@sparkle/icons/mini";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

type ItemProps = {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  size?: "sm" | "md";
  selected?: boolean;
  disabled?: boolean;
  label: string;
  icon?: ComponentType;
  className?: string;
  href?: string;
};

const sizeClasses = {
  sm: "py-2 text-sm font-medium",
  md: "py-3 text-sm font-semibold",
};

const baseClasses =
  "group inline-flex transition-colors ease-out duration-400 box-border gap-x-2 select-none";

const iconBaseClasses = "h-5 w-5 transition-colors ease-out duration-400";

const iconClasses = {
  default: {
    base: "text-element-700",
    hover: "group-hover:text-action-400",
    dark: {
      base: "dark:text-element-700-dark",
      hover: "dark:group-hover:text-action-500-dark",
    },
  },
  selected: {
    base: "text-action-400",
    hover: "",
    dark: {
      base: "dark:text-action-400-dark",
      hover: "",
    },
  },
};

const chevronClasses = {
  default: {
    base: "text-element-600",
    hover: "group-hover:text-action-400",
    dark: {
      base: "dark:text-element-600-dark",
      hover: "dark:group-hover:text-action-500-dark",
    },
  },
  selected: {
    base: "text-action-300",
    hover: "",
    dark: {
      base: "dark:text-action-300-dark",
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
      base: "dark:text-element-900-dark",
      hover: "dark:hover:text-action-400",
      active: "dark:active:text-action-600",
    },
    disabled: "opacity-50",
  },
  selected: {
    base: "text-action-500",
    dark: {
      base: "dark:text-action-500-dark",
    },
  },
};

export function Item({
  onClick,
  selected = false,
  size = "sm",
  disabled = false,
  label,
  icon,
  className = "",
  href,
}: ItemProps) {
  const { components } = React.useContext(SparkleContext);

  const currentStateClasses = selected
    ? stateClasses.selected
    : stateClasses.default;

  const currentIconClasses = selected
    ? iconClasses.selected
    : iconClasses.default;

  const currentChevronClasses = selected
    ? chevronClasses.selected
    : chevronClasses.default;

  const itemClasses = classNames(
    baseClasses,
    sizeClasses[size],
    disabled ? "cursor-default" : currentStateClasses.base,
    disabled ? "cursor-default" : currentStateClasses.dark?.base,
    disabled ? currentStateClasses.disabled : "",
    !selected && !disabled ? currentStateClasses.hover : "",
    !selected && !disabled ? currentStateClasses.dark?.hover : "",
    !selected && !disabled ? currentStateClasses.active : "",
    !selected && !disabled ? currentStateClasses.dark?.active : "",
    className
  );

  const finalIconClasses = classNames(
    iconBaseClasses,
    currentIconClasses.base,
    !disabled ? currentIconClasses.hover : "", // Add condition here
    currentIconClasses.dark.base,
    !disabled ? currentIconClasses.dark.hover : "" // Add condition here
  );

  const finalCevronClasses = classNames(
    iconBaseClasses,
    size === "sm" ? "text-transparent" : currentChevronClasses.base,
    !disabled ? currentChevronClasses.hover : "", // Add condition here
    currentChevronClasses.dark.base,
    !disabled ? currentChevronClasses.dark.hover : "" // Add condition here
  );

  const Link: SparkleContextLinkType = href ? components.link : noHrefLink;

  return (
    <Link
      className={itemClasses}
      onClick={selected || disabled ? undefined : onClick}
      aria-label={label}
      href={href || "#"}
    >
      {icon && <Icon IconComponent={icon} className={finalIconClasses} />}
      <span className="grow">{label}</span>
      <Icon IconComponent={ChevronRight} className={finalCevronClasses} />
    </Link>
  );
}
