import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect } from "storybook/test";

import { Counter } from "../components/Counter";

const meta = {
  title: "Primitives/Counter",
  component: Counter,
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
      options: ["primary", "highlight", "warning", "outline", "ghost"],
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

// All three counter sizes side by side.
export const Sizes: Story = {
  tags: ["ai-generated", "needs-work"],
  render: () => (
    <div className="s-flex s-items-center s-gap-2">
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
