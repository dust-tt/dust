import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { BUTTON_SIZES, BUTTON_VARIANTS } from "@sparkle/components/Button";

import { PlusIcon, RobotIcon, SplitButton } from "../index_with_tw_base";

const meta: Meta<React.ComponentProps<typeof SplitButton>> = {
  title: "Primitives/SplitButton",
  component: SplitButton,
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
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const ExampleButton: Story = {
  args: {
    variant: "outline",
    size: "md",
    defaultAction: {
      label: "First",
      icon: PlusIcon,
      tooltip: "First tooltip",
    },
    actions: [
      {
        label: "First",
        icon: PlusIcon,
        tooltip: "First tooltip",
      },
      {
        label: "Second",
        icon: RobotIcon,
        tooltip: "Second tooltip",
        disabled: true,
      },
      {
        label: "Third",
        icon: PlusIcon,
        tooltip: "Third tooltip",
      },
    ],
  },
};
