import React, { SyntheticEvent } from "react";
import { ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

interface HoverableProps {
  children: ReactNode;
  className?: string;
  onClick: (e: SyntheticEvent) => void;
  variant?: "primary" | "invisible";
}

export function Hoverable({
  children,
  className = "",
  onClick,
  variant = "invisible",
}: HoverableProps) {
  const baseClasses = "s-cursor-pointer s-duration-300";

  const variantClasses = {
    invisible: "hover:s-text-action-500 active:s-text-action-600",
    primary: "s-font-bold s-text-blue-500 hover:active:s-text-action-600",
  };

  return (
    <span
      className={classNames(baseClasses, variantClasses[variant], className)}
      onClick={onClick}
    >
      {children}
    </span>
  );
}
