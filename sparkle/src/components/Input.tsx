import { NewInput } from "@sparkle/components/NewInput";
import React, { forwardRef } from "react";

const MESSAGE_STATUS = ["info", "default", "error"] as const;
type MessageStatus = (typeof MESSAGE_STATUS)[number];

// Preview-branch shim: keeps old InputProps type, delegates to NewInput.
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> {
  message?: string | null;
  messageStatus?: MessageStatus;
  value?: string | null;
  isError?: boolean;
  className?: string;
  containerClassName?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  // Destructure the HTML `size` attr (number) so it doesn't conflict with NewInput's size prop.
  ({ size: _htmlSize, ...props }, ref) => {
    return <NewInput ref={ref} size="sm" {...props} />;
  }
);

Input.displayName = "Input";
