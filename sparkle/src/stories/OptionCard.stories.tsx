import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { OptionCard } from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/OptionCard",
  component: OptionCard,
  parameters: {
    docs: {
      description: {
        component: `A selectable card representing one choice the user can pick in response to an agent prompt. Shows a \`label\`, optional \`description\`, and an optional \`counterValue\` badge; \`selected\` toggles its active styling and \`disabled\` makes it non-interactive. Becomes clickable when an \`onClick\` handler is provided.

**When to use**
- To present a small set of mutually understandable options (e.g. which sources to include) that the user selects before the agent continues.

**Guidelines**
- Provide \`onClick\` to make the card interactive; without it the card is display-only.
- Use \`counterValue\` to convey ordering or quantity, and \`selected\` to reflect the current choice (it sets \`aria-pressed\`).
- Stack multiple cards in a column; for one-tap suggested prompts that send immediately, use **QuickReplyBlock** instead.`,
      },
    },
  },
  tags: ["autodocs"],
  args: {
    label: "Summarize today's emails",
    description:
      "Unread messages, key threads, and anything that needs a reply.",
    counterValue: 1,
    selected: false,
    disabled: false,
  },
} satisfies Meta<typeof OptionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const GenericQuestion: Story = {
  render: () => (
    <div className="s-flex s-w-full s-max-w-sm s-flex-col s-gap-2">
      <OptionCard
        label="Unread emails"
        description="Only conversations you have not opened yet."
        counterValue={1}
        selected
      />
      <OptionCard
        label="Slack mentions"
        description="Messages where you were directly tagged."
        counterValue={2}
        selected
      />
      <OptionCard
        label="Calendar conflicts"
        description="Events that overlap with your focus blocks."
        counterValue={3}
      />
    </div>
  ),
};

export const DisabledOption: Story = {
  render: () => (
    <div className="s-flex s-w-full s-max-w-sm s-flex-col s-gap-2">
      <OptionCard
        label="Slack mentions"
        description="Messages where you were directly tagged."
        counterValue={2}
        disabled
      />
      <OptionCard
        label="Calendar conflicts"
        description="Events that overlap with your focus blocks."
        counterValue={3}
      />
    </div>
  ),
};
