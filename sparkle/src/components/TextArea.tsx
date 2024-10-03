import React from "react";

import { classNames } from "@sparkle/lib/utils";

export interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string | null;
  showErrorLabel?: boolean;
  minRows?: number;
  className?: string;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      error,
      showErrorLabel = false,
      className,
      minRows = 10,
      ...props
    }: TextAreaProps,
    ref
  ) => {
    return (
      <div className="s-flex s-flex-col s-gap-1 s-p-px">
        <textarea
          rows={minRows}
          ref={ref}
          className={classNames(
            "overflow-y-auto s-block s-w-full s-min-w-0 s-rounded-xl s-text-sm s-placeholder-element-700 s-transition-all s-duration-200 s-scrollbar-hide",
            !error
              ? "s-border-structure-100 focus:s-border-action-300 focus:s-ring-action-300"
              : "s-border-red-500 focus:s-border-red-500 focus:s-ring-red-500",
            "s-border-structure-200 s-bg-structure-50",
            "s-resize-y",
            className ?? ""
          )}
          {...props}
        />
        {error && showErrorLabel && (
          <div className="s-ml-2 s-text-sm s-text-warning-500">{error}</div>
        )}
      </div>
    );
  }
);
