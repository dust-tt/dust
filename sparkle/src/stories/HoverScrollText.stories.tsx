import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { HoverScrollText } from "@sparkle/components";

const meta = {
  title: "Effects & Motion/HoverScrollText",
  component: HoverScrollText,
  parameters: {
    docs: {
      description: {
        component: `A single line of text that is ellipsis-truncated at rest and scrolls horizontally to reveal its end while an ancestor \`group\` is hovered. It snaps back to its start when the hover ends.

**When to use**
- For labels in narrow rows (suggestions, sidebar items) where the full text matters but a tooltip is too heavy.

**Guidelines**
- Put a \`group\` class on the hover target (typically the whole row); the text only scrolls while that element is hovered.
- Text that fits renders as a plain line, and reduced motion keeps the ellipsis.`,
      },
    },
  },
  argTypes: {
    text: {
      control: "text",
      description: "The text rendered on a single line",
    },
    className: {
      control: "text",
      description: "Classes applied to the clipping wrapper",
    },
  },
  render: (args) => (
    <div className="group flex w-64 items-center rounded-xl p-2 hover:bg-hover">
      <HoverScrollText {...args} />
    </div>
  ),
} satisfies Meta<typeof HoverScrollText>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A label longer than its row: hover the row to scroll it to the end.
 * @summary Truncated text that scrolls on hover.
 */
export const LongText: Story = {
  args: {
    text: "Summarize the latest customer feedback and draft a reply for each ticket",
    className: "copy-sm text-foreground",
  },
};

/**
 * A label that fits its row renders as plain text and does not move on hover.
 * @summary Text that fits stays still.
 */
export const ShortText: Story = {
  args: {
    text: "Draft a reply",
    className: "copy-sm text-foreground",
  },
};
