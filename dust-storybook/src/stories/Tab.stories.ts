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
        name: "Assistant",
        href: "#",
        current: false,
        title: true,
        icon: ChatBubbleBottomCenterText,
      },
      { name: "Lab", href: "#", current: false, title: true, icon: Beaker },
      { name: "Team Members", href: "#", title: true, current: true },
      {
        name: "Billing",
        href: "#",
        current: false,
        title: false,
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
