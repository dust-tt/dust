import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, EmptyCTA, EmptyCTAButton } from "@sparkle/components";
import { Download01, Plus } from "@sparkle/icons/v2-stroke";

const meta: Meta<typeof EmptyCTA> = {
  title: "Feedback & Status/EmptyCTA",
  component: EmptyCTA,
  parameters: {
    docs: {
      description: {
        component: `An empty-state placeholder that explains why a region has no content and offers a way forward. Renders an optional **message** alongside an **action** slot — typically an **EmptyCTAButton** (or a regular **Button**) that lets the user create the first item.

**When to use**
- When a list, table, or section has no data yet and you want to guide the user toward populating it.

**Guidelines**
- Keep the \`message\` short and explain what's missing; let the \`action\` describe the next step.
- Prefer **EmptyCTAButton** for the primary action to keep empty states visually consistent.
- For a transient loading placeholder rather than a true empty state, use a **LoadingBlock** skeleton.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The standard empty state: a short message explaining what's missing, plus an
 * EmptyCTAButton pointing at the next step. Use this pairing for most empty
 * lists and sections.
 * @summary Message and EmptyCTAButton together.
 */
export const WithMessage: Story = {
  args: {
    message: "You don't have any spaces yet.",
    action: <EmptyCTAButton icon={Download01} label="Create a new space" />,
  },
};

/**
 * An empty state reduced to its action slot — no message — with a regular
 * Button. Use when the surrounding context already explains what's missing and
 * only the call to action is needed.
 * @summary Action slot only, no message.
 */
export const ActionOnly: Story = {
  args: {
    action: <Button icon={Plus} label="Add domain" />,
  },
};
