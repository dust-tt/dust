import { Meta } from "@storybook/react";
import React, { useEffect, useRef, useState } from "react";

import { cn, RainbowEffect } from "../index_with_tw_base";

const meta = {
  title: "Effects & Motion/RainbowEffect",
  component: RainbowEffect,
  parameters: {
    docs: {
      description: {
        component: `Wraps a child element in an animated, multicolor glow that bleeds out from behind it — typically used to highlight a focused input or active surface. The **size** prop controls how far the glow spreads (e.g. \`medium\` at rest, \`large\` when active), and **containerClassName** / **className** size the wrapper and inner layer.

**When to use**
- To draw attention to a primary input or call-to-action when it becomes focused or active.

**Guidelines**
- Drive **size** from state (e.g. enlarge on focus) so the glow responds to interaction.
- Use on one focal element at a time; multiple competing glows dilute the emphasis.`,
      },
    },
  },
} satisfies Meta<typeof RainbowEffect>;

export default meta;

const Example = () => {
  const [isFocused, setIsFocused] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (divRef.current && !divRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  const handleFocus = () => {
    setIsFocused(true);
  };

  return (
    <div className="s-flex s-w-[900px] s-flex-1 s-px-0">
      <RainbowEffect
        containerClassName="s-w-full"
        className="s-w-full"
        size={isFocused ? "large" : "medium"}
      >
        <div
          ref={divRef}
          onClick={handleFocus}
          className={cn(
            "s-relative s-flex s-h-[120px] s-w-full s-flex-row s-p-5",
            "s-rounded-3xl s-border s-border-border/0 s-bg-primary-50 s-transition-all",
            isFocused
              ? "s-border-border s-ring-2 s-ring-highlight-300 s-ring-offset-2"
              : ""
          )}
        >
          Hello
        </div>
      </RainbowEffect>
    </div>
  );
};

export const Demo = () => <Example />;
