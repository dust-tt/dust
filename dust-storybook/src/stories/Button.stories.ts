import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "sparkle";

const meta = {
  title: "Example/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    type: "primary",
    size: "sm",
    label: "Label",
    disabled: false,
  },
};

export const Secondary: Story = {
  args: {
    type: "secondary",
    size: "sm",
    label: "Label",
    disabled: false,
  },
};
