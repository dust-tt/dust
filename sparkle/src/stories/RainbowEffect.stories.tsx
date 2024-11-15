import { Meta } from "@storybook/react";
import React from "react";

import { cn, RainbowEffect } from "../index_with_tw_base";

const meta = {
  title: "Effects/RainbowEffect",
  component: RainbowEffect,
} satisfies Meta<typeof RainbowEffect>;

export default meta;

const Example = () => (
  <div className="s-flex s-w-[900px] s-flex-1 s-px-0">
    <RainbowEffect containerClassName="s-w-full" className="s-w-full">
      <div
        className={cn(
          "s-relative s-flex s-h-[120px] s-w-full s-flex-row s-p-3",
          "s-rounded-2xl s-border s-border-element-500 s-border-primary-200 s-bg-primary-50 s-transition-all",
          "s-ring-2 s-ring-highlight-300 s-ring-offset-2"
        )}
      >
        Hello
      </div>
    </RainbowEffect>
  </div>
);

export const Demo = () => <Example />;
