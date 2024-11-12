import React, { SyntheticEvent } from "react";
import { ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

interface HoverableProps {
  children: ReactNode;
  className?: string;
  onClick: (e: SyntheticEvent) => void;
  variant?: "primary" | "highlight" | "invisible";
}

export function Hoverable({
  children,
  className = "",
  onClick,
  variant = "invisible",
}: HoverableProps) {
  const baseClasses =
    "s-cursor-pointer s-duration-200 hover:s-underline hover:s-text-highlight-light hover:s-underline-offset-2 active:s-text-highlight-dark";

  const variantClasses = {
    invisible: "",
    primary: "s-font-medium s-text-foreground",
    highlight: "s-font-medium s-text-highlight",
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
