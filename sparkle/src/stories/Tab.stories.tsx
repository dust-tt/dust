import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { RobotIcon, Tab } from "../index_with_tw_base";
import {
  ChatBubbleBottomCenterTextIcon,
  Cog6ToothIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Atoms/Tab",
  component: Tab,
} satisfies Meta<typeof Tab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ButtonExamples = () => (
  <div className="s-w-[320px]">
    <Tab
      tabs={[
        {
          label: "Chat",
          current: true,
          icon: ChatBubbleBottomCenterTextIcon,
          sizing: "expand",
        },
        {
          label: "Build",
          current: false,
          icon: RobotIcon,
          sizing: "expand",
          hasSeparator: true,
        },
        {
          label: "Settings",
          hideLabel: true,
          current: false,
          icon: Cog6ToothIcon,
        },
      ]}
      onTabClick={(tabName, event) => {
        // add logic here
        event.preventDefault();
        console.log(tabName);
      }}
    />
  </div>
);

export const TabNavigation: Story = {
  args: {
    tabs: [
      {
        label: "Conversations",
        current: true,
        icon: ChatBubbleBottomCenterTextIcon,
        sizing: "hug",
      },
      {
        label: "Assistants",
        current: false,
        icon: RobotIcon,
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
