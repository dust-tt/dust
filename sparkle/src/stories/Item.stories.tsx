import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Item } from "../index_with_tw_base";
import { Cog6ToothIcon } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Item",
  component: Item,
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListItemExample = () => (
  <div>
    <Item.List className="s-w-60">
      <Item.SectionHeader label="Section Header" />
      <Item
        size="sm"
        label="Deploying a new Sparkle Icon set and GitHub action"
      />
      <Item size="sm" label="Item 2" />
      <Item
        size="sm"
        label="Adding custom colors and color schemes to Tailwind"
      />
    </Item.List>
    <div className="s-h-8" />
    <Item.List className="s-w-40">
      <Item.SectionHeader label="Section Header" />
      <Item size="md" label="Item 1" icon={Cog6ToothIcon} />
      <Item size="md" label="Item 2" icon={Cog6ToothIcon} />
      <Item size="md" label="Item 3" icon={Cog6ToothIcon} />
    </Item.List>
  </div>
);

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

export const ItemWithVisual: Story = {
  args: {
    label: "gpt4",
    size: "md",
    variant: "dropdown",
    visual: "https://dust.tt/static/droidavatar/Droid_Black_1.jpg",
  },
};
