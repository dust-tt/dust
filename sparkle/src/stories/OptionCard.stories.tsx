import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { OptionCard } from "../index_with_tw_base";

const meta = {
  title: "Conversation/OptionCard",
  component: OptionCard,
  tags: ["autodocs"],
  args: {
    label: "Summarize today's emails",
    description:
      "Unread messages, key threads, and anything that needs a reply.",
    counterValue: 1,
    selected: false,
    selectionStyle: "single",
    disabled: false,
  },
} satisfies Meta<typeof OptionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SingleSelectQuestion: Story = {
  render: () => (
    <div className="s-flex s-w-full s-max-w-sm s-flex-col s-gap-2">
      <OptionCard
        label="Reply with the short version"
        description="A concise answer with only the key points."
        counterValue={1}
      />
      <OptionCard
        label="Reply with the detailed version"
        description="Include context, caveats, and next steps."
        counterValue={2}
        selected
        selectionStyle="single"
      />
      <OptionCard
        label="Write the response for me"
        description="Draft the full reply in your tone."
        counterValue={3}
      />
    </div>
  ),
};

export const MultiSelectQuestion: Story = {
  render: () => (
    <div className="s-flex s-w-full s-max-w-sm s-flex-col s-gap-2">
      <OptionCard
        label="Unread emails"
        description="Only conversations you have not opened yet."
        counterValue={1}
        selected
        selectionStyle="multi"
      />
      <OptionCard
        label="Slack mentions"
        description="Messages where you were directly tagged."
        counterValue={2}
        selected
        selectionStyle="multi"
      />
      <OptionCard
        label="Calendar conflicts"
        description="Events that overlap with your focus blocks."
        counterValue={3}
        selectionStyle="multi"
      />
    </div>
  ),
};
