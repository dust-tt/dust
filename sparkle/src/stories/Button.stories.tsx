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
      description: "The size of the button",
      options: BUTTON_SIZES,
      control: { type: "select" },
    },
    icon: {
      description: "Optional icon to display in the button",
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
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
} satisfies Meta<React.ComponentProps<typeof Button>>;

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
  },
};
