import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ButtonsSwitch, ButtonsSwitchList } from "../index_with_tw_base";

const meta = {
  title: "Components/ButtonsSwitch",
  component: ButtonsSwitchList,
  tags: ["autodocs"],
} satisfies Meta<typeof ButtonsSwitchList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="s-w-[360px] s-p-4">
      <ButtonsSwitchList defaultValue="time" className="s-w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
      </ButtonsSwitchList>
    </div>
  ),
};

export const Controlled: Story = {
  render: () => (
    <ButtonsSwitchList defaultValue="time">
      <ButtonsSwitch value="time" label="Time range" />
      <ButtonsSwitch value="version" label="Version" />
      <ButtonsSwitch value="other" label="Other" />
    </ButtonsSwitchList>
  ),
};
