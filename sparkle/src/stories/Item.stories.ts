import type { Meta, StoryObj } from "@storybook/react";
import { Item } from "../index_with_tw_base";
import { Cog6ToothIcon } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Item",
  component: Item,
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ItemMD: Story = {
  args: {
    label: "Settings",
    size: "md",
    icon: Cog6ToothIcon,
    disabled: false,
    selected: false,
  },
};

export const ItemSM: Story = {
  args: {
    label: "Settings",
    size: "sm",
    icon: Cog6ToothIcon,
    disabled: false,
    selected: false,
  },
};

export const ItemWithoutIcon: Story = {
  args: {
    label: "Conversation about Dust's origines",
    size: "sm",
    disabled: false,
    selected: false,
  },
};
