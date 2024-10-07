import type { Meta, StoryObj } from "@storybook/react";

import { Cog6ToothIcon, IconButton } from "../index_with_tw_base";

const meta = {
  title: "Primitives/IconButton",
  component: IconButton,
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconButtonPrimary: Story = {
  args: {
    variant: "primary",
    size: "md",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonWithTooltip: Story = {
  args: {
    variant: "primary",
    tooltip: "Your settings",
    tooltipPosition: "bottom",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonSecondary: Story = {
  args: {
    variant: "secondary",
    tooltip: "This a secondary IconButton",
    tooltipPosition: "bottom",
    icon: Cog6ToothIcon,
  },
};

export const IconButtonTertiary: Story = {
  args: {
    variant: "tertiary",
    tooltip: "This a tertiary IconButton",
    tooltipPosition: "bottom",
    icon: Cog6ToothIcon,
  },
};
