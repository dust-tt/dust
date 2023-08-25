import type { Meta, StoryObj } from "@storybook/react";

import { ChatBubbleBottomCenterTextIcon, Icon } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Icon",
  component: Icon,
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconSM: Story = {
  args: {
    IconComponent: ChatBubbleBottomCenterTextIcon,
    className: "s-text-action-800",
    size: "sm",
  },
};

export const IconXS: Story = {
  args: {
    IconComponent: ChatBubbleBottomCenterTextIcon,
    className: "s-text-brand",
    size: "xs",
  },
};

export const IconMD: Story = {
  args: {
    IconComponent: ChatBubbleBottomCenterTextIcon,
    className: "s-text-element-800",
    size: "md",
  },
};

export const IconLG: Story = {
  args: {
    IconComponent: ChatBubbleBottomCenterTextIcon,
    className: "s-text-brand",
    size: "lg",
  },
};
