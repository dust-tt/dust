import type { Meta, StoryObj } from "@storybook/react";
import { Item } from "sparkle";
import { Cog6Tooth } from "sparkle/src/icons/mini";

const meta = {
  title: "Example/Item",
  component: Item,
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicItem: Story = {
  args: {
    label: "Settings",
    size: "sm",
    icon: Cog6Tooth,
    disabled: false,
    selected: false,
  },
};
