import type { Meta, StoryObj } from "@storybook/react";

import { ChatBubbleBottomCenterTextIcon, Icon } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Icon",
  component: Icon,
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicIcon: Story = {
  args: {
    IconComponent: ChatBubbleBottomCenterTextIcon,
    className: "text-action-500",
  },
};
