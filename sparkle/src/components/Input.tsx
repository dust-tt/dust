import React from "react";

import { classNames } from "@sparkle/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholder: string;
  error?: string | null;
  showErrorLabel?: boolean;
  isPassword?: boolean;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  placeholder,
  error,
  showErrorLabel = false,
  isPassword = false,
  className = "",
  ...props
}) => {
  return (
    <div>
      <input
        type={isPassword ? "password" : "text"}
        className={classNames(
          "s-border-0 s-outline-none s-ring-1 s-ring-structure-200 focus:s-outline-none focus:s-ring-2",
          "s-w-full s-rounded-md  s-bg-structure-50 s-py-1.5 s-pl-4 s-pr-8 s-placeholder-element-600",
          "s-transition-all s-duration-300 s-ease-out",
          className ?? "",
          !error
            ? "focus:s-ring-action-300"
            : "s-ring-red-200 focus:s-ring-red-200"
        )}
        placeholder={placeholder}
        data-1p-ignore={!isPassword}
        {...props}
      />
      <div className="s-ml-2 s-h-4 s-text-red-500">
        {showErrorLabel && error ? error : null}
      </div>
    </div>
  );
};
