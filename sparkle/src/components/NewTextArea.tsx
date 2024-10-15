import * as React from "react";

import { cn } from "@sparkle/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const textAreaStyles = cn(
  "s-flex s-min-h-[80px] s-w-full s-px-3 s-py-2",
  "s-transition s-duration-100",
  "s-text-sm placeholder:s-text-muted-foreground s-text-foreground",
  "s-ring-offset-background s-border s-border-border-dark s-bg-background s-rounded-xl",
  "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2 focus-visible:s-border-border-focus",
  "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-text-muted-foreground"
);

const NewTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(textAreaStyles, className)}
        ref={ref}
        {...props}
      />
    );
  }
);
NewTextarea.displayName = "Textarea";

export { NewTextarea };
