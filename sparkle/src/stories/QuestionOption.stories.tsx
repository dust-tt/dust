import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { QuestionOption } from "../index_with_tw_base";

const meta = {
  title: "Conversation/QuestionOption",
  component: QuestionOption,
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
} satisfies Meta<typeof QuestionOption>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () => (
    <div className="s-flex s-w-[360px] s-flex-col s-gap-2">
      <QuestionOption
        label="Summarize today's emails"
        description="Unread messages, key threads, and anything that needs a reply."
        counterValue={1}
      />
      <QuestionOption
        label="Show unread emails"
        description="Only the messages you have not opened yet."
        counterValue={2}
        selected
      />
      <QuestionOption
        label="Include Slack too"
        description="Combine email and Slack into one digest."
        counterValue={3}
        selected
        selectionStyle="multi"
      />
      <QuestionOption label="Type something else" counterValue={4} disabled />
    </div>
  ),
};
