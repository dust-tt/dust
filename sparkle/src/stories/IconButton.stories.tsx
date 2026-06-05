import type { Meta, StoryObj } from "@storybook/react";

import { Settings01, IconButton } from "../index_with_tw_base";

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
    icon: Settings01,
  },
};

export const IconButtonWithTooltip: Story = {
  args: {
    variant: "primary",
    tooltip: "Your settings",
    icon: Settings01,
  },
};

export const IconButtonSecondary: Story = {
  args: {
    variant: "highlight",
    tooltip: "This a highlight IconButton",
    icon: Settings01,
  },
};

export const IconButtonTertiary: Story = {
  args: {
    variant: "ghost",
    tooltip: "This a ghost IconButton",
    icon: Settings01,
  },
};
