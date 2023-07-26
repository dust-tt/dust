import type { Meta, StoryObj } from "@storybook/react";
import { Icon, ChatBubbleBottomCenterTextIcon } from "sparkle";

import "sparkle/dist/cjs/index.css";

const meta = {
  title: "Atoms/Icon",
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
