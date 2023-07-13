import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "sparkle";

// More on how to set up stories at: https://storybook.js.org/docs/react/writing-stories/introduction
const meta = {
  title: "Example/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// More on writing stories with args: https://storybook.js.org/docs/react/writing-stories/args
export const Normal: Story = {
  args: {
    type: "button",
    children: "Button",
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    type: "button",
    children: "Disabled",
    disabled: true,
  },
};
