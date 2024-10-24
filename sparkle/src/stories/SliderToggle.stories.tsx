import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, SliderToggle } from "../index_with_tw_base";

const meta = {
  title: "Primitives/SliderToggle",
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
      <Button variant="outline" size="sm" label="Settings" />
      <SliderToggle size="sm" />
      <SliderToggle size="sm" selected />
      <SliderToggle size="sm" disabled />
    </div>

    <div className="s-flex s-items-center s-gap-2">
      <Button variant="outline" size="xs" label="Settings" />
      <SliderToggle size="xs" />
      <SliderToggle size="xs" selected />
      <SliderToggle size="xs" disabled />
    </div>
  </div>
);
