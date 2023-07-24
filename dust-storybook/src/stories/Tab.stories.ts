import type { Meta, StoryObj } from "@storybook/react";
import { Tab } from "sparkle";
import {
  ChatBubbleBottomCenterText,
  Beaker,
  Cog6Tooth,
} from "sparkle/src/icons/mini";

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
        current: false,
        icon: ChatBubbleBottomCenterText,
      },
      { label: "Lab", href: "#", current: false, icon: Beaker },
      {
        label: "Team Members",
        href: "#",
        current: true,
        icon: Beaker,
      },
      {
        label: "Billing",
        hideLabel: true,
        href: "#",
        current: false,
        icon: Cog6Tooth,
      },
    ],
    onTabClick: (tabName, event) => {
      // add logic here
      event.preventDefault();
      console.log(tabName);
    },
  },
};
