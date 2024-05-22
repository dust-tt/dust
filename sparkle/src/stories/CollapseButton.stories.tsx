import type { Meta } from "@storybook/react";
import React from "react";

import { CollapseButton } from "../index_with_tw_base";

const meta = {
  title: "Primitives/CollapseButton",
  component: CollapseButton,
} satisfies Meta<typeof CollapseButton>;

export default meta;

export const CollapseExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-4">
      <CollapseButton direction="left" />
      <CollapseButton direction="right" />
    </div>
  );
};
