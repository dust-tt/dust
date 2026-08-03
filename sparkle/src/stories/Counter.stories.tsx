import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect } from "storybook/test";

import { Counter } from "../components/Counter";

const meta = {
  title: "Data Display/Counter",
  component: Counter,
  parameters: {
    docs: {
      description: {
        component: `A small numeric badge that communicates a count — unread items, pending actions, or results. Available in several **sizes** and **variants**, and can be embedded inside a **Button** via **isInButton**.

**When to use**
- To show a count attached to an item, tab, or button.

**Guidelines**
- Use it for counts, not arbitrary text.
- Cap large values for legibility (e.g. show "99+").
- Match the **variant** to the surrounding control; use **highlight** or **warning** only to draw attention.`,
      },
    },
  },
  args: {
    value: 4,
    size: "sm",
    variant: "primary",
    isInButton: false,
  },
  argTypes: {
    value: {
      control: { type: "number" },
    },
    size: {
      control: { type: "select" },
      options: ["xs", "sm", "md"],
    },
    variant: {
      control: { type: "select" },
      options: ["primary", "highlight", "warning", "info", "outline", "ghost"],
    },
    isInButton: {
      control: "boolean",
      description: "Whether the counter is displayed inside a button",
    },
  },
} satisfies Meta<typeof Counter>;

export default meta;

export const Default = {
  args: {
    value: 4,
    variant: "primary",
    isInButton: false,
  },
};

type Story = StoryObj<typeof meta>;

export const Highlight: Story = {
  args: { variant: "highlight" },
  tags: ["ai-generated", "needs-work"],
};

export const Warning: Story = {
  args: { variant: "warning" },
  tags: ["ai-generated", "needs-work"],
};

export const Outline: Story = {
  args: { variant: "outline" },
  tags: ["ai-generated", "needs-work"],
};

export const Info: Story = {
  args: { variant: "info" },
  tags: ["ai-generated", "needs-work"],
};

// Every variant as a gradient pill, across the three sizes.
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(
        ["primary", "highlight", "warning", "info", "outline", "ghost"] as const
      ).map((variant) => (
        <div key={variant} className="flex items-center gap-2">
          <Counter value={1} size="xs" variant={variant} />
          <Counter value={42} size="sm" variant={variant} />
          <Counter value={128} size="md" variant={variant} />
        </div>
      ))}
    </div>
  ),
};

// All three counter sizes side by side.
export const Sizes: Story = {
  tags: ["ai-generated", "needs-work"],
  render: () => (
    <div className="flex items-center gap-2">
      <Counter value={3} size="xs" />
      <Counter value={42} size="sm" />
      <Counter value={128} size="md" />
    </div>
  ),
};

// Smoke play: the numeric `value` prop must be rendered as text.
export const DisplaysValue: Story = {
  args: { value: 99 },
  tags: ["ai-generated", "needs-work"],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("99")).toBeVisible();
  },
};
