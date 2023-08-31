import React from "react";

import { classNames } from "@sparkle/lib/utils";

export interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "success" | "action" | "lightGrey" | "darkGrey" | "white";
}

const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "lightGrey",
}) => {
  const sizeClasses = {
    xs: "s-h-4 s-w-4",
    sm: "s-h-5 s-w-5",
    md: "s-h-6 s-w-6",
    lg: "s-h-8 s-w-8",
  };

  const colorClasses = {
    success: "s-bg-success-500",
    action: "s-bg-action-500 dark:s-bg-action-500-dark",
    white: "s-bg-structure-0 dark:s-bg-black",
    lightGrey: "s-bg-element-600 dark:s-bg-element-600-dark",
    darkGrey: "s-bg-element-800 dark:s-bg-element-900-dark",
  };

  const colorSecClasses = {
    success: "s-bg-success-300",
    action: "s-bg-sky-300 dark:s-bg-sky-700",
    white: "s-opacity-40 s-bg-structure-0 dark:s-bg-structure-0-dark",
    lightGrey: "s-bg-element-500 dark:s-bg-element-500-dark",
    darkGrey: "s-bg-element-600 dark:s-bg-element-600-dark",
  };

  return (
    <>
      <div className={classNames("s-relative", sizeClasses[size])}>
        <div
          className={classNames(
            "s-absolute s-inset-0 s-rounded-full",
            colorSecClasses[variant]
          )}
        />
        <div
          className={classNames(
            "s-absolute s-left-0 s-animate-move-square",
            sizeClasses[size]
          )}
        >
          <div
            className={classNames("s-h-full s-w-full", colorClasses[variant])}
          />
        </div>
      </div>
    </>
  );
};

export default Spinner;
