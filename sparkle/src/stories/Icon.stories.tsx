import type { Meta, StoryObj } from "@storybook/react";

import { MessageCircle01V2, Icon } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Icon",
  component: Icon,
  tags: ["autodocs"],
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconSM: Story = {
  args: {
    visual: MessageCircle01V2,
    className: "s-text-highlight-500",
    size: "sm",
  },
};

export const IconXS: Story = {
  args: {
    visual: MessageCircle01V2,
    className: "s-text-highlight-500",
    size: "xs",
  },
};

export const IconMD: Story = {
  args: {
    visual: MessageCircle01V2,
    className: "s-text-highlight-500",
    size: "md",
  },
};

export const IconLG: Story = {
  args: {
    visual: MessageCircle01V2,
    className: "s-text-highlight-500",
    size: "lg",
  },
};
