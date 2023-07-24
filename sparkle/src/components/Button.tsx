import React, { MouseEvent } from "react";

import { classNames } from "../lib/utils";

type ButtonProps = {
  type?: "primary" | "secondary";
  size?: "xs" | "sm" | "md";
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  label: string;
  className?: string;
};

const sizeClasses = {
  xs: "px-2.5 py-1.5 text-xs font-medium rounded-md",
  sm: "px-3 py-2 text-xs font-bold rounded-lg",
  md: "px-4 py-3 text-sm font-bold rounded-xl",
};

const typeClasses = {
  primary: {
    base: "text-white bg-action-500 border-action-600",
    hover: "hover:bg-action-400 hover:border-action-500",
    active: "active:bg-action-600 active:border-action-700",
    dark: {
      base: "dark:bg-action-500-dark dark:border-action-600-dark",
      hover: "dark:hover:bg-action-500-dark dark:hover:border-action-500-dark",
      active:
        "dark:active:bg-action-600-dark dark:active:border-action-700-dark",
    },
  },
  secondary: {
    base: "text-action-500 border-structure-200",
    hover: "hover:bg-action-50 hover:border-action-300",
    active: "active:bg-action-100 active:border-action-500",
    dark: {
      base: "dark:text-action-500-dark dark:border-structure-300-dark",
      hover: "dark:hover:bg-action-50-dark dark:hover:border-action-300-dark",
      active:
        "dark:active:bg-action-100-dark dark:active:border-action-500-dark",
    },
  },
};

export function Button({
  type = "primary",
  size = "sm",
  onClick,
  disabled = false,
  label,
  className = "",
}: ButtonProps) {
  const buttonClasses = classNames(
    "inline-flex items-center border-2 transition-colors duration-200",
    sizeClasses[size],
    typeClasses[type]?.base,
    typeClasses[type]?.hover,
    typeClasses[type]?.active,
    typeClasses[type]?.dark?.base,
    typeClasses[type]?.dark?.hover,
    typeClasses[type]?.dark?.active,
    disabled ? "cursor-not-allowed opacity-50 bg-gray-200" : "",
    className
  );

  return (
    <button
      type="button"
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {label}
    </button>
  );
}
