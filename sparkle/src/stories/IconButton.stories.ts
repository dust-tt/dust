import type { Meta, StoryObj } from "@storybook/react";

import { Cog6ToothIcon, IconButton } from "../index_with_tw_base";

const meta = {
  title: "Atoms/IconButton",
  component: IconButton,
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconButtonPrimary: Story = {
  args: {
    type: "primary",
    size: "md",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonWithTooltip: Story = {
  args: {
    type: "primary",
    tooltip: "Your settings",
    tooltipPosition: "below",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonSecondary: Story = {
  args: {
    type: "secondary",
    tooltip: "This a secondary IconButton",
    tooltipPosition: "below",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonTertiary: Story = {
  args: {
    type: "tertiary",
    tooltip: "This a tertiary IconButton",
    tooltipPosition: "below",
    icon: Cog6ToothIcon,
  },
};
