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

export const States: Story = {
  render: () => (
    <div className="s-flex s-w-[360px] s-flex-col s-gap-2">
      <OptionCard
        label="Summarize today's emails"
        description="Unread messages, key threads, and anything that needs a reply."
        counterValue={1}
      />
      <OptionCard
        label="Show unread emails"
        description="Only the messages you have not opened yet."
        counterValue={2}
        selected
      />
      <OptionCard
        label="Include Slack too"
        description="Combine email and Slack into one digest."
        counterValue={3}
        selected
        selectionStyle="multi"
      />
      <OptionCard label="Type something else" counterValue={4} disabled />
    </div>
  ),
};
