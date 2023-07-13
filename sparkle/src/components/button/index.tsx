import React from "react";

import { classNames } from "@sparkle/lib/utils";

export function Button({
  type = "button",
  onClick = null,
  disabled = false,
  children,
}: React.PropsWithChildren<{
  type?: "button" | "submit" | "reset" | undefined;
  onClick?: any;
  disabled?: boolean;
}>) {
  return (
    <button
      type={type ? type : "button"}
      className={classNames(
        "inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium leading-4",
        disabled ? "text-gray-300" : "text-gray-700 hover:bg-gray-50",
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
