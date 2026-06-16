import type { Meta, StoryObj } from "@storybook/react";

import { Settings01, IconButton } from "../index_with_tw_base";

const meta = {
  title: "Actions/IconButton",
  component: IconButton,
  parameters: {
    docs: {
      description: {
        component: `A compact, label-less button rendered as a single **icon**. It comes in several visual **variant**s (\`primary\`, \`highlight\`, \`ghost\`, …) and **size**s, and accepts an optional \`tooltip\` to convey its meaning.

**When to use**
- For dense toolbars or inline controls where a full labelled button would be too large.
- For ubiquitous, self-explanatory actions (settings, close, edit).

**Guidelines**
- Always provide a \`tooltip\` (or accessible label) — the icon alone may not convey the action.
- Choose an icon whose meaning is unambiguous; otherwise use a labelled **Button**.
- For a primary call-to-action that benefits from a label, prefer **Button** over **IconButton**.`,
      },
    },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconButtonPrimary: Story = {
  args: {
    variant: "primary",
    size: "md",
    icon: Settings01,
  },
};

export const IconButtonWithTooltip: Story = {
  args: {
    variant: "primary",
    tooltip: "Your settings",
    icon: Settings01,
  },
};

export const IconButtonSecondary: Story = {
  args: {
    variant: "highlight",
    tooltip: "This a highlight IconButton",
    icon: Settings01,
  },
};

export const IconButtonTertiary: Story = {
  args: {
    variant: "ghost",
    tooltip: "This a ghost IconButton",
    icon: Settings01,
  },
};
