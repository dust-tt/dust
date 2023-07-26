import type { Meta, StoryObj } from "@storybook/react";
import { Button, Cog6ToothIcon } from "sparkle";

import "sparkle/dist/cjs/index.css";

const meta = {
  title: "Atoms/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    type: "primary",
    size: "xs",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const Secondary: Story = {
  args: {
    type: "secondary",
    size: "sm",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const Tertiary: Story = {
  args: {
    type: "tertiary",
    size: "md",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};
