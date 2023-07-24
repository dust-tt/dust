import type { Meta, StoryObj } from "@storybook/react";
import { Tab } from "sparkle";
import { Beaker } from "sparkle/src/icons/mini";

const meta = {
  title: "Example/Tab",
  component: Tab,
} satisfies Meta<typeof Tab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TabNavigation: Story = {
  args: {
    tabs: [
      { name: "My Account", href: "#", current: false, icon: Beaker },
      { name: "Company", href: "#", current: false },
      { name: "Team Members", href: "#", current: true },
      { name: "Billing", href: "#", current: false },
    ],
    onTabClick: (tabName, event) => {
      // add logic here
      event.preventDefault();
      console.log(tabName);
    },
  },
};
