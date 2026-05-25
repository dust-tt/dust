import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Input, SettingsList, SliderToggle } from "../index_with_tw_base";

const meta = {
  title: "Components/SettingsList",
  component: SettingsList,
  args: {
    children: null,
  },
} satisfies Meta<typeof SettingsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="s-w-full s-max-w-xl">
      <SettingsList>
        <SettingsList.Row
          title="Upgrade request"
          description="Allow users to request plan upgrades and limit increase"
          action={<SliderToggle selected={false} />}
        />
        <SettingsList.Row
          title="Auto upgrade Free to Pro"
          description="Automatically upgrade free users to pro plan when they reach their limit"
          action={<SliderToggle selected />}
        />
        <SettingsList.Row
          title="Default usage limit"
          description="Define the default usage limit for all the users in your workspace"
          action={
            <Input
              type="text"
              inputMode="numeric"
              defaultValue="1000"
              className="s-w-28"
            />
          }
        />
      </SettingsList>
    </div>
  ),
};

// Exercises the optional `description` and `action` props: rows can omit
// either, and the layout should remain coherent when mixed.
export const OptionalDescriptionAndAction: Story = {
  render: () => (
    <div className="s-w-full s-max-w-xl">
      <SettingsList>
        <SettingsList.Row
          title="Title and action only"
          action={<SliderToggle selected />}
        />
        <SettingsList.Row
          title="Title and description only"
          description="No action is rendered when the prop is omitted."
        />
        <SettingsList.Row title="Title only" />
      </SettingsList>
    </div>
  ),
};
