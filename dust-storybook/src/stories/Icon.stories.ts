import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "sparkle";
import { ChatBubbleBottomCenterText } from "sparkle/src/icons/mini";

const meta = {
  title: "Example/Icon",
  component: Icon,
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicIcon: Story = {
  args: {
    IconComponent: ChatBubbleBottomCenterText,
    className: "w-6 h-6 fill-action-500",
  },
};
