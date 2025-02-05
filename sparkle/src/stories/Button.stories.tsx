import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { BUTTON_SIZES, BUTTON_VARIANTS } from "@sparkle/components/Button";

import { Button, PlusIcon, RobotIcon } from "../index_with_tw_base";

const ICONS = {
  none: null,
  PlusIcon: PlusIcon,
  RobotIcon: RobotIcon,
} as const;

const meta = {
  title: "Primitives/Button",
  component: Button,
  argTypes: {
    variant: {
      description: "The visual style variant of the button",
      options: BUTTON_VARIANTS,
      control: { type: "select" },
    },
    size: {
      description:
        "The size of the button (Note: 'mini' size requires an icon and cannot have a label)",
      options: BUTTON_SIZES,
      control: { type: "select" },
    },
    icon: {
      description: "Icon to display in the button (Required for mini size)",
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      if: { arg: "size", neq: "mini" },
    },
    label: {
      description: "Button label (Not available for mini size)",
      control: { type: "text" },
      if: { arg: "size", neq: "mini" },
    },
    disabled: {
      description: "Whether the button should be disabled",
      control: "boolean",
      defaultValue: false,
    },
    isLoading: {
      description: "Whether the button should display a loading spinner",
      control: "boolean",
    },
    isPulsing: {
      description: "Whether the button should have a pulsing animation",
      control: "boolean",
    },
    isSelect: {
      description: "Whether the button should display a dropdown chevron",
      control: "boolean",
    },
    tooltip: {
      description: "Optional tooltip text to display on hover",
      control: "text",
    },
  },
  render: (args) => {
    if (args.size === "mini" && !args.icon) {
      args.icon = ICONS.PlusIcon;
    }
    return <Button {...args} />;
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExampleButton: Story = {
  args: {
    variant: "outline",
    label: "Button",
    size: "md",
    isLoading: false,
    isPulsing: false,
    isSelect: false,
    disabled: false,
  },
};

export const MiniButton: Story = {
  render: () => <Button size="mini" icon={PlusIcon} />,
};
