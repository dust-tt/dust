import React, { SyntheticEvent } from "react";
import { ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

interface HoverableProps {
  children: ReactNode;
  className: string;
  onClick: (e: SyntheticEvent) => void;
}

Hoverable.defaultProps = {
  className: "",
};

export function Hoverable({ children, className, onClick }: HoverableProps) {
  return (
    <span
      className={classNames(
        "s-cursor-pointer s-duration-300 hover:s-text-action-500 active:s-text-action-600",
        className
      )}
      onClick={onClick}
    >
      {children}
    </span>
  );
}
