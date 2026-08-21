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
type Story = StoryObj<typeof meta>;

/**
 * The standard counter — a primary badge showing a small count next to an
 * item or tab. Tweak `value`, `size`, and `variant` from the Controls panel.
 * @summary Standard numeric count badge.
 */
export const Default: Story = {
  args: {
    value: 4,
    variant: "primary",
    isInButton: false,
  },
};

/**
 * The highlight variant draws the eye to a count that demands attention, such
 * as unread notifications. Reserve it for one attention point per view.
 * @summary Attention-drawing highlight counter.
 */
export const Highlight: Story = {
  args: { variant: "highlight" },
};

/**
 * The warning variant flags a count tied to a problem state — failing items
 * or actions that need remediation.
 * @summary Problem-state warning counter.
 */
export const Warning: Story = {
  args: { variant: "warning" },
};

/**
 * Visual reference: every variant rendered across the three sizes
 * (xs / sm / md) to compare color treatments and scale. Kept for design
 * review.
 * @summary Variant-by-size visual reference grid.
 */
export const AllVariants: Story = {
  tags: ["!manifest"],
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

/**
 * Interaction test: asserts the numeric `value` prop is rendered as visible
 * text. Its value is in the `play` assertion, not the visual.
 * @summary Smoke test that the value renders.
 */
export const DisplaysValue: Story = {
  args: { value: 99 },
  tags: ["!manifest"],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("99")).toBeVisible();
  },
};
