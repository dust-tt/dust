import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Atom01V2,
  MessageChatCircleV2,
  NavTabPill,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  Settings02V2,
} from "../index_with_tw_base";

const meta = {
  title: "Components/NavTabPill",
  component: NavTabPill,
  tags: ["autodocs"],
} satisfies Meta<typeof NavTabPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="s-w-80">
      <NavTabPill defaultValue="overview">
        <NavTabPillList>
          <NavTabPillTrigger value="overview" icon={MessageChatCircleV2}>
            Work
          </NavTabPillTrigger>
          <NavTabPillTrigger value="analytics" icon={Atom01V2}>
            Spaces
          </NavTabPillTrigger>
          <NavTabPillTrigger value="settings" icon={Settings02V2}>
            Admin
          </NavTabPillTrigger>
        </NavTabPillList>
        <NavTabPillContent value="overview">Overview content</NavTabPillContent>
        <NavTabPillContent value="analytics">
          Analytics content
        </NavTabPillContent>
        <NavTabPillContent value="settings">Settings content</NavTabPillContent>
      </NavTabPill>
    </div>
  ),
};
