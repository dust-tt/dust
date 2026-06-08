import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Planet,
  IntersectDust,
  NavTabPill,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  Settings01,
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
          <NavTabPillTrigger value="overview" icon={IntersectDust}>
            Work
          </NavTabPillTrigger>
          <NavTabPillTrigger value="analytics" icon={Planet}>
            Spaces
          </NavTabPillTrigger>
          <NavTabPillTrigger value="settings" icon={Settings01}>
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
