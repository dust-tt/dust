import * as React from "react";

import { classNames, cn } from "@sparkle/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const inputClasses = classNames(
  "s-text-sm s-bg-background s-rounded-xl s-border s-border-border-dark",
  "s-flex s-h-9 s-w-full s-px-3 s-py-1.5 ",
  "file:s-border-0 file:s-bg-transparent file:s-text-sm file:s-font-medium file:s-text-foreground",
  "placeholder:s-text-muted-foreground",
  "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-highlight-200 focus-visible:s-border-primary-400",
  "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-text-muted-foreground"
);

const NewInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, disabled, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          inputClasses,
          className,
          type === "file" || disabled
            ? "s-text-muted-foreground"
            : "s-text-foreground"
        )}
        ref={ref}
        disabled={disabled} // Ensure the disabled prop is passed to the input element
        {...props}
      />
    );
  }
);
NewInput.displayName = "Input";

export { NewInput };
