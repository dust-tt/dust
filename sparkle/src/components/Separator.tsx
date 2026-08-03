import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref
  ) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0",
        "bg-separator",
        orientation === "horizontal"
          ? "h-[1px] min-w-full"
          : "min-h-full w-[1px] self-stretch",
        className ?? ""
      )}
      {...props}
    />
  )
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
