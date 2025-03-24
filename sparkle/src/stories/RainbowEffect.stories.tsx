import { Meta } from "@storybook/react";
import React, { useEffect, useRef, useState } from "react";

import { cn, RainbowEffect } from "../index_with_tw_base";

const meta = {
  title: "Effects/RainbowEffect",
  component: RainbowEffect,
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
