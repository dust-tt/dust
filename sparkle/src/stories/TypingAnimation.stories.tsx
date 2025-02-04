import type { Meta } from "@storybook/react";
import React from "react";

import { TypingAnimation } from "@sparkle/components";

const meta = {
  title: "Effects/TypingAnimation",
  component: TypingAnimation,
} satisfies Meta<typeof TypingAnimation>;

export default meta;

export const Demo = () => {
  return (
    <div>
      <div className="s-flex s-items-center s-space-x-2 s-text-xl">
        <TypingAnimation text="Hello world" />
      </div>
    </div>
  );
};
