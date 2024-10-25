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

export const TabExample = () => {
  const [currentTab, setCurrentTab] = React.useState("chat");
  const [currentTab2, setCurrentTab2] = React.useState("instructions");
  return (
    <div className="s-flex s-flex-col s-gap-10">
      <div className="s-w-[320px]">
        <Tab
          tabs={[
            {
              label: "Chat",
              id: "chat",
              current: currentTab === "chat",
              icon: ChatBubbleBottomCenterTextIcon,
              sizing: "expand",
            },
            {
              label: "Build",
              id: "build",
              current: currentTab === "build",
              icon: RobotIcon,
              sizing: "expand",
            },
            {
              label: "Admin",
              id: "admin",
              current: currentTab === "admin",
              icon: RobotIcon,
              sizing: "expand",
              hasSeparator: true,
              disabled: true,
            },
            {
              label: "Settings",
              id: "settings",
              hideLabel: true,
              current: false,
              icon: Cog6ToothIcon,
            },
          ]}
          setCurrentTab={(tabId, event) => {
            // add logic here
            event.preventDefault();
            setCurrentTab(tabId);
          }}
        />
      </div>
      <div className="s-w-full">
        <Tab
          variant="stepper"
          tabs={[
            {
              label: "Instructions",
              id: "instructions",
              current: currentTab2 === "instructions",
              icon: SquareIcon,
              sizing: "hug",
            },
            {
              label: "Data sources & Actions",
              id: "data",
              current: currentTab2 === "data",
              icon: CircleIcon,
              sizing: "hug",
            },
            {
              label: "Naming",
              id: "naming",
              current: currentTab2 === "naming",
              icon: TriangleIcon,
              sizing: "hug",
            },
          ]}
          setCurrentTab={(tabId, event) => {
            // add logic here
            event.preventDefault();
            setCurrentTab2(tabId);
          }}
        />
      </div>
    </div>
  );
};
