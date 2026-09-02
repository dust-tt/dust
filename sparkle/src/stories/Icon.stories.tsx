import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { MessageCircle01, Icon } from "../index_with_tw_base";

const ICON_SIZES = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl"] as const;

const meta = {
  title: "Data Display/Icon",
  component: Icon,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Renders an SVG icon component passed via **visual** at a consistent **size** (\`2xs\` through \`2xl\`). Color is inherited from text color, so apply a \`text-*\` class via \`className\`.

**When to use**
- To display a standalone glyph inside labels, buttons, list items, or status indicators.

**Guidelines**
- Set color with a text utility (e.g. \`text-highlight-500\`) rather than hard-coding fills.
- For an icon overlaid with a provider badge use **DoubleIcon**; for clickable icons prefer **IconButton** or **Button** with an \`icon\`.`,
      },
    },
  },
  argTypes: {
    size: {
      description: "The size of the icon",
      options: ICON_SIZES,
      control: { type: "select" },
    },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A single icon with its color set through a text utility class. Use the size
 * control to preview the icon at every scale.
 * @summary Args-driven icon with size control.
 */
export const Default: Story = {
  args: {
    visual: MessageCircle01,
    className: "text-highlight-500",
    size: "sm",
  },
};

/**
 * An icon composed inside a list row next to a text label — the documented use
 * case: the glyph inherits alignment from the flex row and its color from a
 * text utility, while the label carries the meaning.
 * @summary Icon paired with a text label in a row.
 */
export const InLabelRow: Story = {
  args: {
    visual: MessageCircle01,
    className: "text-muted-foreground",
    size: "sm",
  },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Icon {...args} />
      <span className="text-sm text-foreground">Conversations</span>
    </div>
  ),
};

/**
 * Design-review reference: the same glyph at every size step, xs through 2xl,
 * for comparing the scale at a glance.
 * @summary All size steps side by side.
 */
export const Sizes: Story = {
  tags: ["!manifest"],
  args: {
    visual: MessageCircle01,
    className: "text-highlight-500",
  },
  render: (args) => (
    <div className="flex items-end gap-4">
      {ICON_SIZES.map((size) => (
        <div key={size} className="flex flex-col items-center gap-1">
          <Icon {...args} size={size} />
          <span className="text-xs text-muted-foreground">{size}</span>
        </div>
      ))}
    </div>
  ),
};
