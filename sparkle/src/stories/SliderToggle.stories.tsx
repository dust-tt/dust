import type { Meta, StoryObj } from "@storybook/react";

import { SliderToggle } from "../index_with_tw_base";

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
