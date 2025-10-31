import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import {
  ButtonsSwitch,
  ButtonsSwitchList,
} from "../index_with_tw_base";

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
  render: () => {
    const [value, setValue] = useState("time");
    return (
      <div className="s-flex s-flex-col s-gap-4 s-p-4">
        <ButtonsSwitchList value={value} onValueChange={setValue}>
          <ButtonsSwitch value="time" label="Time range" />
          <ButtonsSwitch value="version" label="Version" />
          <ButtonsSwitch value="other" label="Other" />
        </ButtonsSwitchList>
        <div className="s-text-sm s-text-muted-foreground">
          Selected: <span className="s-font-medium s-text-foreground">{value}</span>
        </div>
      </div>
    );
  },
};

