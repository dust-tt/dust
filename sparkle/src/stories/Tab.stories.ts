import type { Meta, StoryObj } from "@storybook/react";
import { Tab } from "../index_with_tw_base";
import {
  ChatBubbleBottomCenterTextIcon,
  BeakerIcon,
  Cog6ToothIcon,
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
        sizing: "expand",
      },
      {
        label: "Lab",
        current: false,
        icon: BeakerIcon,
        sizing: "expand",
      },
      {
        label: "No Icon",
        current: false,
        sizing: "expand",
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
