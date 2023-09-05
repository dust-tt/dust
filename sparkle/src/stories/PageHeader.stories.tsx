import type { Meta, StoryObj } from "@storybook/react";

import {
  ChatBubbleBottomCenterTextIcon,
  PageHeader,
} from "../index_with_tw_base";

const meta = {
  title: "PageLayout/PageHeader",
  component: PageHeader,
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicPageHeader: Story = {
  args: {
    title: "Knowledge Base",
    icon: ChatBubbleBottomCenterTextIcon,
    description: "This is an optional short description",
  },
};
