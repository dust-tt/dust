import type { Meta, StoryObj } from "@storybook/react";
import { Tab } from "@dust-tt/sparkle";
import {
  ChatBubbleBottomCenterTextIcon,
  BeakerIcon,
  Cog6ToothIcon,
} from "@dust-tt/sparkle";

const meta = {
  title: "Example/Tab",
  component: Tab,
} satisfies Meta<typeof Tab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TabNavigation: Story = {
  args: {
    tabs: [
      {
        label: "Assistant",
        href: "#",
        current: true,
        icon: ChatBubbleBottomCenterTextIcon,
        sizing: "expand",
      },
      {
        label: "Lab",
        href: "#",
        current: false,
        icon: BeakerIcon,
        sizing: "expand",
      },
      {
        label: "No Icon",
        href: "#",
        current: false,
        sizing: "expand",
      },
      {
        label: "Settings",
        hideLabel: true,
        href: "#",
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
