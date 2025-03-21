import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { CHIP_COLORS, CHIP_SIZES } from "@sparkle/components/Chip";

import { Chip, UserGroupIcon } from "../index_with_tw_base";

const ICONS = {
  none: null,
  UserGroupIcon: UserGroupIcon,
} as const;

const meta = {
  title: "Primitives/Chip",
  component: Chip,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    size: {
      options: CHIP_SIZES,
      control: { type: "select" },
      description: "Size of the chip",
      defaultValue: "xs",
    },
    color: {
      options: CHIP_COLORS,
      control: { type: "select" },
      description: "Color variant of the chip",
      defaultValue: "slate",
    },
    label: {
      control: "text",
      description: "Text to display in the chip",
    },
    isBusy: {
      control: "boolean",
      description: "Whether to show the breathing animation",
      defaultValue: false,
    },
    icon: {
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      description: "Optional icon to display",
      defaultValue: "none",
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic example with controls
export const Basic: Story = {
  args: {
    label: "Example Chip",
    size: "sm",
    color: "slate",
    isBusy: true,
    onRemove: undefined,
  },
};

export const ThinkingChip = () => (
  <Chip
    size="sm"
    color="slate"
    label="Thinking, Searching"
    isBusy
    onClick={() => console.log()}
  />
);

export const RemovableChip = () => (
  <Chip
    size="sm"
    color="slate"
    label="Remove me"
    onRemove={() => alert("Removed")}
  />
);
