import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as React from "react";

import { classNames } from "@sparkle/lib/utils";

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
      className={classNames(
        "s-shrink-0",
        "dark:s-bg-separator-night s-bg-separator",
        orientation === "horizontal"
          ? "s-h-[1px] s-min-w-full"
          : "s-min-h-full s-w-[1px]",
        className ?? ""
      )}
      {...props}
    />
  )
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
