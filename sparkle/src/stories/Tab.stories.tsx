import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { Tab, TabProps } from "../components/Tab";
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

export const TabTest = () => {
  const [selectedTab, setSelectedTab] = useState("Assistant");
  const tabsData: TabProps[] = [
    {
      label: "Assistant",
      icon: ChatBubbleBottomCenterTextIcon,
      sizing: "hug",
      current: false, // You'll need to add a 'current' property as it's required in TabType
    },
    {
      label: "Lab",
      icon: TestTubeIcon,
      sizing: "hug",
      hasSeparator: true,
      current: false,
    },
    {
      label: "Settings",
      hideLabel: true,
      icon: Cog6ToothIcon,
      current: false,
    },
  ];

  // Dynamically set the 'current' property based on the selected tab
  const tabs = tabsData.map((tab) => ({
    ...tab,
    current: tab.label === selectedTab,
  }));

  return (
    <Tab
      tabs={tabs}
      onTabClick={(tabName, event) => {
        event.preventDefault();
        setSelectedTab(tabName);
      }}
    />
  );
};

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
