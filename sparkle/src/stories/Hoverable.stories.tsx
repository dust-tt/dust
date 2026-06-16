import type { Meta, StoryObj } from "@storybook/react";

import { Hoverable, HOVERABLE_VARIANTS } from "@sparkle/components/Hoverable";

const meta = {
  title: "Effects & Motion/Hoverable",
  component: Hoverable,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `Wraps inline text or content to give it interactive affordance on hover. The **variant** prop controls the resting appearance (e.g. \`invisible\` until hovered, vs. an always-styled link look), and passing **href** renders it as a link while **onClick** makes it behave as a button.

**When to use**
- For inline, low-emphasis interactions inside running text where a full **Button** would be too heavy.

**Guidelines**
- Provide **href** for navigation or **onClick** for actions, not both for the same element.
- Use the \`invisible\` **variant** to keep prose clean until the user hovers; for standalone actions prefer **Button** or **Link**.`,
      },
    },
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
