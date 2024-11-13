import type { Meta, StoryObj } from "@storybook/react";

import { Hoverable, HOVERABLE_VARIANTS } from "@sparkle/components/Hoverable";

const meta = {
  title: "Primitives/Hoverable",
  component: Hoverable,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    variant: {
      options: HOVERABLE_VARIANTS,
      control: { type: "select" },
      description: "Visual style variant",
      defaultValue: "invisible",
    },
    children: {
      control: "text",
      description: "Text content to display",
    },
    href: {
      control: "text",
      description: "Optional URL for link behavior",
    },
    target: {
      options: ["_self", "_blank", "_parent", "_top"],
      control: { type: "select" },
      description: "Target attribute for link",
      defaultValue: "_self",
    },
    onClick: {
      action: "clicked",
      description: "Click handler function",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
} satisfies Meta<typeof Hoverable>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic example with controls
export const Basic: Story = {
  args: {
    children: "I am hoverable text",
    variant: "invisible",
  },
};
