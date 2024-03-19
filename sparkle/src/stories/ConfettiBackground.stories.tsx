import type { Meta } from "@storybook/react";
import React from "react";

import { ConfettiBackground } from "@sparkle/index";

const meta = {
  title: "Components/ConfettiBackground",
  component: ConfettiBackground,
} satisfies Meta<typeof ConfettiBackground>;

export default meta;

export const ConfettiExample = () => {
  return (
    <div className="s-h-full s-w-full">
      <ConfettiBackground variant="confetti" />
    </div>
  );
};
export const SnowExample = () => {
  return (
    <div className="s-h-full s-w-full">
      <ConfettiBackground variant="snow" />
    </div>
  );
};
