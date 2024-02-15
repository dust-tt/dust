import type { Meta } from "@storybook/react";
import React from "react";

import {
  CircleIcon,
  RobotIcon,
  SquareIcon,
  Tab,
  TriangleIcon,
} from "../index_with_tw_base";
import {
  ChatBubbleBottomCenterTextIcon,
  Cog6ToothIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Components/Tab",
  component: Tab,
} satisfies Meta<typeof Tab>;

export default meta;

export const TabExample = () => (
  <div className="s-flex s-flex-col s-gap-10">
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
    <div className="s-w-full">
      <Tab
        variant="stepper"
        tabs={[
          {
            label: "Instructions",
            current: true,
            icon: SquareIcon,
            sizing: "hug",
          },
          {
            label: "Data sources & Actions",
            current: false,
            icon: CircleIcon,
            sizing: "hug",
          },
          {
            label: "Naming",
            current: false,
            icon: TriangleIcon,
            sizing: "hug",
          },
        ]}
        onTabClick={(tabName, event) => {
          // add logic here
          event.preventDefault();
          console.log(tabName);
        }}
      />
    </div>
  </div>
);
