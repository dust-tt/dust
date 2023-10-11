import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Chip } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Chip",
  component: Chip,
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

const colors = [
  "emerald",
  "amber",
  "slate",
  "violet",
  "warning",
  "sky",
  "pink",
  "indigo",
  "action",
] as const;

export const ListChipsExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div className="s-flex s-gap-2">
      {colors.map((color) => (
        <Chip key={`xs-${color}`} size="xs" label={color} color={color} />
      ))}
    </div>
    <div className="s-flex s-gap-2">
      {colors.map((color) => (
        <Chip key={`xs-${color}`} size="sm" label={color} color={color} />
      ))}
    </div>
  </div>
);

export const ChipEmerald: Story = {
  args: {
    label: "Settings",
    color: "emerald",
  },
};

export const ChipSM: Story = {
  args: {
    label: "Settings",
    color: "emerald",
  },
};

export const ChipMD: Story = {
  args: {
    label: "Settings",
    color: "emerald",
    size: "xs",
  },
};

export const ChipAmber: Story = {
  args: {
    label: "Settings",
    size: "sm",
    color: "amber",
  },
};

export const ChipViolet: Story = {
  args: {
    label: "Conversation about Dust's origines",
    color: "violet",
  },
};
