import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { CHIP_COLORS, CHIP_SIZES } from "@sparkle/components/Chip";

import { ChevronDownIcon, Chip, UserGroupIcon } from "../index_with_tw_base";

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
    icon: {
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      description: "Optional start icon to display",
      defaultValue: "none",
    },
    endIcon: {
      options: [false, true],
      control: "boolean",
      description: "Whether to show the end icon (X by default)",
      defaultValue: false,
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    label: "Example Chip",
    size: "sm",
    color: "slate",
    endIcon: false,
  },
};

export const ChipShowcase = () => (
  <div className="s-flex s-h-80 s-w-full s-flex-col s-items-start s-justify-start s-gap-4">
    <div className="s-flex s-gap-2">
      <Chip size="xs" color="slate" label="Default XS" />
      <Chip
        size="xs"
        color="slate"
        label="With start icon"
        icon={UserGroupIcon}
      />
      <Chip size="xs" color="slate" label="With end icon" endIcon />
      <Chip
        size="xs"
        color="slate"
        label="Custom end icon"
        endIcon={ChevronDownIcon}
      />
      <Chip
        size="xs"
        color="slate"
        label="Both icons"
        icon={UserGroupIcon}
        endIcon
      />
    </div>

    <div className="s-flex s-gap-2">
      <Chip size="sm" color="slate" label="Default SM" />
      <Chip
        size="sm"
        color="slate"
        label="With start icon"
        icon={UserGroupIcon}
      />
      <Chip size="sm" color="slate" label="With end icon" endIcon />
      <Chip
        size="sm"
        color="slate"
        label="Custom end icon"
        endIcon={ChevronDownIcon}
      />
      <Chip
        size="sm"
        color="slate"
        label="Both icons"
        icon={UserGroupIcon}
        endIcon
      />
    </div>

    <div className="s-flex s-gap-2">
      {CHIP_COLORS.map((color) => (
        <Chip key={color} color={color} label={color} endIcon />
      ))}
    </div>
  </div>
);
