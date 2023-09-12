import type { Meta, StoryObj } from "@storybook/react";

import { Tab } from "../index_with_tw_base";
import {
  ChatBubbleBottomCenterTextIcon,
  Cog6ToothIcon,
  TestTubeIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Atoms/Tab",
  component: Tab,
} satisfies Meta<typeof Tab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TabNavigation: Story = {
  args: {
    tabs: [
      {
        label: "Assistant",
        current: true,
        icon: ChatBubbleBottomCenterTextIcon,
        sizing: "hug",
      },
      {
        label: "Lab",
        current: false,
        icon: TestTubeIcon,
        sizing: "hug",
        hasSeparator: true,
      },
      {
        label: "Settings",
        hideLabel: true,
        current: false,
        icon: Cog6ToothIcon,
      },
    ],
    onTabClick: (tabName, event) => {
      // add logic here
      event.preventDefault();
      console.log(tabName);
    },
  },
};
