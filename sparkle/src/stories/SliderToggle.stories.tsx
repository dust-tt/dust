import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, SliderToggle } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/SliderToggle",
  component: SliderToggle,
  parameters: {
    docs: {
      description: {
        component: `A compact on/off switch for toggling a single setting that takes effect immediately. Reflects state via **selected** and can be **disabled**.

**When to use**
- For binary settings that apply instantly without a separate save action (e.g. enabling a feature in a settings row).

**Guidelines**
- Use **selected** as the source of truth and update it from the toggle handler.
- For an option that is part of a form submitted later, or that needs an inline label and description, prefer **Checkbox**.
- Pair with **SettingsList.Row** to align toggles with their title and description.`,
      },
    },
  },
} satisfies Meta<typeof SliderToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SliderToggleBasic: Story = {
  args: {
    selected: false,
  },
};

export const SliderExample = () => (
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" label="Settings" />
    <SliderToggle />
    <SliderToggle selected />
    <SliderToggle disabled />
    <SliderToggle selected disabled />
  </div>
);
