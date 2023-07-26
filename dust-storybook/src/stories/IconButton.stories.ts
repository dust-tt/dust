import type { Meta, StoryObj } from "@storybook/react";
import { IconButton, Cog6ToothIcon } from "sparkle";

import "sparkle/dist/cjs/index.css";

const meta = {
  title: "Atoms/IconButton",
  component: IconButton,
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconButtonPrimary: Story = {
  args: {
    type: "primary",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonWithTooltip: Story = {
  args: {
    type: "primary",
    tooltip: "Your settings",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonSecondary: Story = {
  args: {
    type: "secondary",
    tooltip: "This a secondary IconButton",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonTertiary: Story = {
  args: {
    type: "tertiary",
    tooltip: "This a tertiary IconButton",
    icon: Cog6ToothIcon,
  },
};
