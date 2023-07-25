import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "sparkle";
import { Cog6Tooth } from "sparkle/src/icons/mini";

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
    label: "Settings",
    icon: Cog6Tooth,
    disabled: false,
  },
};

export const Secondary: Story = {
  args: {
    type: "secondary",
    size: "sm",
    label: "Settings",
    icon: Cog6Tooth,
    disabled: false,
  },
};

export const Tertiary: Story = {
  args: {
    type: "tertiary",
    size: "sm",
    label: "Settings",
    icon: Cog6Tooth,
    disabled: false,
  },
};
