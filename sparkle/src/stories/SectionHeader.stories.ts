import type { Meta, StoryObj } from "@storybook/react";

import {
  ChatBubbleBottomCenterPlusIcon,
  SectionHeader,
} from "../index_with_tw_base";

const meta = {
  title: "PageLayout/SectionHeader",
  component: SectionHeader,
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicPageHeader: Story = {
  args: {
    title: "Managed Data Sources",
    description:
      "This is an optional short description of the section that says stuff about it. Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    action: {
      label: "Add a new Data Source",
      type: "secondary",
      icon: ChatBubbleBottomCenterPlusIcon,
    },
  },
};
