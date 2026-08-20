import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

/**
 * A thin dividing line for visually separating content, with an `orientation`
 * (`horizontal` / `vertical`) and a `decorative` flag. Use it to divide groups of related
 * content, list items, or inline elements; set `decorative={false}` only when the
 * separation is meaningful to screen-reader users. Add spacing via margin utilities
 * (e.g. `my-4`) rather than relying on the line itself.
 *
 * @summary Thin dividing line.
 */
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
