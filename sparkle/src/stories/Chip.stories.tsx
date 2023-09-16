import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Chip } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Chip",
  component: Chip,
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListChipsExample = () => (
  <div>
    <Chip.List className="s-w-60">
      <Chip size="xs" label="From here to there" />
      <Chip size="xs" label="Chip 2" color="emerald" />
      <Chip size="xs" label="Adding custom stuff" color="violet" />
      <Chip size="xs" label="Warning chip" color="warning" />
    </Chip.List>
    <div className="s-h-8" />
    <Chip.List className="s-w-40">
      <Chip size="sm" label="Chip 1" color="amber" />
      <Chip size="sm" label="Chip 2" />
      <Chip size="sm" label="Chip 3" />
    </Chip.List>
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
