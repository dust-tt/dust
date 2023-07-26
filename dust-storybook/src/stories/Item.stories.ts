import type { Meta, StoryObj } from "@storybook/react";
import { Item } from "sparkle";
import { Cog6ToothIcon } from "sparkle";

import "sparkle/dist/cjs/index.css";

const meta = {
  title: "Atoms/Item",
  component: Item,
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicItem: Story = {
  args: {
    label: "Settings",
    size: "md",
    icon: Cog6ToothIcon,
    disabled: false,
    selected: false,
  },
};
