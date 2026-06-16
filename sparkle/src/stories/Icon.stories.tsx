import type { Meta, StoryObj } from "@storybook/react";

import { MessageCircle01, Icon } from "../index_with_tw_base";

const meta = {
  title: "Data Display/Icon",
  component: Icon,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Renders an SVG icon component passed via **visual** at a consistent **size** (\`xs\`, \`sm\`, \`md\`, \`lg\`). Color is inherited from text color, so apply a \`s-text-*\` class via \`className\`.

**When to use**
- To display a standalone glyph inside labels, buttons, list items, or status indicators.

**Guidelines**
- Set color with a text utility (e.g. \`s-text-highlight-500\`) rather than hard-coding fills.
- For an icon overlaid with a provider badge use **DoubleIcon**; for clickable icons prefer **IconButton** or **Button** with an \`icon\`.`,
      },
    },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconSM: Story = {
  args: {
    visual: MessageCircle01,
    className: "s-text-highlight-500",
    size: "sm",
  },
};

export const IconXS: Story = {
  args: {
    visual: MessageCircle01,
    className: "s-text-highlight-500",
    size: "xs",
  },
};

export const IconMD: Story = {
  args: {
    visual: MessageCircle01,
    className: "s-text-highlight-500",
    size: "md",
  },
};

export const IconLG: Story = {
  args: {
    visual: MessageCircle01,
    className: "s-text-highlight-500",
    size: "lg",
  },
};
