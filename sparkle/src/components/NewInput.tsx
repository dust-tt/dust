import * as React from "react";

import { classNames, cn } from "@sparkle/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const inputStyleClasses = classNames(
  "s-text-sm s-text-foreground s-bg-background s-rounded-xl s-border s-border-border-dark",
  "s-transition s-duration-100",
  "s-flex s-h-9 s-w-full s-px-3 s-py-1.5 ",
  "file:s-border-0 file:s-bg-transparent file:s-text-sm file:s-font-medium file:s-text-foreground",
  "placeholder:s-text-muted-foreground",
  "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2 focus-visible:s-ring-ring focus-visible:s-border-border-focus",
  "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-text-muted-foreground"
);

const NewInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, disabled, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          inputStyleClasses,
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
