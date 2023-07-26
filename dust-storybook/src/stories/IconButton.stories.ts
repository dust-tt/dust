import type { Meta, StoryObj } from "@storybook/react";
import { IconButton, Cog6ToothIcon } from "sparkle";

import "sparkle/dist/cjs/index.css";

const meta = {
  title: "Atoms/IconButton",
  component: IconButton,
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconButtonBasic: Story = {
  args: {
    icon: Cog6ToothIcon,
  },
};

export const IconButtonWithTooltip: Story = {
  args: {
    tooltip: "Your settings",
    icon: Cog6ToothIcon,
  },
};
