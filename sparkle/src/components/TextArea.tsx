import React, { useEffect, useRef } from "react";

import { classNames } from "@sparkle/lib/utils";

type TextAreaProps = {
  placeholder: string;
  value: string | null;
  onChange: (value: string) => void;
  error?: string | null;
  showErrorLabel?: boolean;
  className?: string;
};

export function TextArea({
  placeholder,
  value,
  onChange,
  error,
  showErrorLabel = false,
  className,
}: TextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto"; // Reset height to recalculate
      textarea.style.height = `${textarea.scrollHeight}px`; // Set to scroll height
    }
  }, [value]); // Re-run when value changes
  return (
    <div className="s-flex s-flex-col s-gap-1 s-p-px">
      <textarea
        ref={textareaRef}
        className={classNames(
          "s-min-h-60 overflow-y-auto s-block s-w-full s-min-w-0 s-rounded-xl s-text-sm s-transition-all s-duration-200 s-scrollbar-hide",
          !error
            ? "s-border-structure-100 focus:s-border-action-300 focus:s-ring-action-300"
            : "s-border-red-500 focus:s-border-red-500 focus:s-ring-red-500",
          "s-border-structure-200 s-bg-structure-50",
          "s-resize-y",
          className ?? ""
        )}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      {error && showErrorLabel && (
        <div className="s-ml-2 s-text-sm s-text-warning-500">{error}</div>
      )}
    </div>
  );
}
