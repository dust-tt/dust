import { Meta } from "@storybook/react";
import React from "react";

import { cn } from "@sparkle/lib";

import { AnimatedShinyText } from "../index_with_tw_base";

const meta = {
  title: "Primitives/AnimatedShinyText",
  component: AnimatedShinyText,
} satisfies Meta<typeof AnimatedShinyText>;

export default meta;

export function AnimatedShinyTextDemo() {
  return (
    <div className="s-z-10 s-flex s-min-h-64 s-items-center s-justify-center">
      <div
        className={cn(
          "dark:s-bg-structure-900 dark:hover:s-bg-structure-800 s-group s-rounded-full s-border s-border-black/5 s-bg-structure-100 s-text-element-800 s-transition-all s-ease-in hover:s-cursor-pointer hover:s-bg-structure-200 dark:s-border-white/5"
        )}
      >
        <AnimatedShinyText className="hover:dark:s-text-element-400 s-inline-flex s-items-center s-justify-center s-px-4 s-py-1 s-transition s-ease-out hover:s-text-element-600 hover:s-duration-300">
          <span>✨ Introducing Magic UI</span>
        </AnimatedShinyText>
      </div>
    </div>
  );
}
