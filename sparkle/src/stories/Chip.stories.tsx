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
  tags: ["autodocs"],
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
    color: "primary",
    isBusy: true,
    onRemove: undefined,
  },
};

export const MiniChip: Story = {
  args: {
    label: "label",
    size: "mini",
    color: "primary",
    isBusy: false,
    onRemove: undefined,
  },
};

export const ThinkingChip: Story = {
  render: () => (
    <Chip
      size="sm"
      label="Thinking, Searching"
      isBusy
      onClick={() => console.log()}
    />
  ),
};

export const RemovableChip: Story = {
  render: () => (
    <div className="s-space-x-2">
      <Chip
        size="mini"
        color="golden"
        label="Remove me"
        onRemove={() => alert("Removed")}
      />
      <Chip
        size="xs"
        color="golden"
        label="Remove me"
        onRemove={() => alert("Removed")}
      />
      <Chip
        size="sm"
        color="golden"
        label="Remove me"
        onRemove={() => alert("Removed")}
      />
    </div>
  ),
};

export const AllColors: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <div className="s-flex s-flex-wrap s-gap-2">
        <Chip size="mini" color="primary" label="Primary" />
        <Chip size="xs" color="primary" label="Primary" />
        <Chip size="sm" color="primary" label="Primary" />
      </div>
      <div className="s-flex s-flex-wrap s-gap-2">
        <Chip size="sm" color="primary" label="Primary" />
        <Chip size="sm" color="highlight" label="Highlight" />
        <Chip size="sm" color="success" label="Success" />
        <Chip size="sm" color="warning" label="Warning" />
        <Chip size="sm" color="info" label="Info" />
        <Chip size="sm" color="green" label="Green" />
        <Chip size="sm" color="blue" label="Blue" />
        <Chip size="sm" color="rose" label="Rose" />
        <Chip size="sm" color="golden" label="Golden" />
      </div>
      <div className="s-flex s-flex-wrap s-gap-2">
        <Chip
          size="sm"
          color="primary"
          label="Primary"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
        <Chip
          size="sm"
          color="highlight"
          label="Highlight"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
        <Chip
          size="sm"
          color="success"
          label="Success"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
        <Chip
          size="sm"
          color="warning"
          label="Warning"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
        <Chip
          size="sm"
          color="info"
          label="Info"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
        <Chip
          size="sm"
          color="green"
          label="Green"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
        <Chip
          size="sm"
          color="blue"
          label="Blue"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
        <Chip
          size="sm"
          color="rose"
          label="Rose"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
        <Chip
          size="sm"
          color="golden"
          label="Golden"
          onClick={() => alert("Clicked")}
          onRemove={() => alert("Removed")}
        />
      </div>
    </div>
  ),
};
