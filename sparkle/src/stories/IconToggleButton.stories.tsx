import type { Meta, StoryObj } from "@storybook/react";

import {
  Cog6ToothIcon,
  Cog6ToothStrokeIcon,
  IconToggleButton,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/IconToggleButton",
  component: IconToggleButton,
} satisfies Meta<typeof IconToggleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconToggleButtonSecondary: Story = {
  args: {
    variant: "secondary",
    tooltip: "This a secondary IconButton",
    icon: Cog6ToothStrokeIcon,
    iconSelected: Cog6ToothIcon,
    selected: false,
  },
};

export const IconToggleButtonTertiary: Story = {
  args: {
    variant: "tertiary",
    tooltip: "This a tertiary IconButton",
    icon: Cog6ToothIcon,
    selected: false,
  },
};
