import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "@dust-tt/sparkle";
import { ChatBubbleBottomCenterTextIcon } from "@dust-tt/sparkle";

const meta = {
  title: "Example/Icon",
  component: Icon,
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicIcon: Story = {
  args: {
    IconComponent: ChatBubbleBottomCenterTextIcon,
    className: "w-6 h-6 text-action-500",
  },
};
