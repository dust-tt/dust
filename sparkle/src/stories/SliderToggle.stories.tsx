import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, SliderToggle } from "../index_with_tw_base";

const meta = {
  title: "Atoms/SliderToggle",
  component: SliderToggle,
} satisfies Meta<typeof SliderToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SliderToggleBasic: Story = {
  args: {
    selected: false,
  },
};

export const SliderExample = () => (
  <div className="s-flex s-flex-col s-gap-6">
    <div className="s-flex s-items-center s-gap-2">
      <Button variant="tertiary" size="sm" label="Settings" />
      <SliderToggle size="sm" />
    </div>

    <div className="s-flex s-items-center s-gap-2">
      <Button variant="tertiary" size="xs" label="Settings" />
      <SliderToggle size="xs" />
    </div>
  </div>
);
