import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  Button,
  QuickReplyBlock,
  QuickReplyContainer,
} from "../index_with_tw_base";

const meta: Meta<typeof QuickReplyBlock> = {
  title: "Product/Conversation/QuickReplyBlock",
  component: QuickReplyBlock,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `A tappable suggested-reply button that sends a predefined message back to the agent. Each **QuickReplyBlock** shows a \`label\`, calls an async \`onSend\` (showing a sending state until it resolves), and can be \`disabled\`. Wrap multiple replies in a **QuickReplyContainer**, which lays them out and can reset them via a React \`key\`.

**When to use**
- To offer the user one-tap follow-up prompts after an agent response (e.g. "Summarize this", "Tell me more").

**Guidelines**
- Keep \`label\`s short and action-oriented; long labels wrap onto multiple lines.
- Always group replies inside a **QuickReplyContainer** rather than rendering loose buttons.
- \`onSend\` is async — the block shows a pending state until the promise settles, so return the actual send promise.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Simulates a network send so the block's pending spinner is visible.
const sendReply = fn(async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 800);
  });
});

/**
 * The default usage: a group of short, action-oriented replies in a
 * **QuickReplyContainer**. Clicking one shows the pending state, then the
 * whole container collapses (the reply was sent). The "Reset" button is story
 * scaffolding — it remounts the container via a React key so the interaction
 * can be replayed.
 * @summary Group of one-tap suggested replies.
 */
export const SuggestedReplies: StoryObj = {
  render: () => {
    const [resetKey, setResetKey] = React.useState(0);

    return (
      <div className="flex w-[280px] flex-col gap-3">
        <Button
          variant="outline"
          size="xs"
          label="Reset"
          onClick={() => setResetKey((value) => value + 1)}
        />
        <QuickReplyContainer key={resetKey} className="w-full">
          <QuickReplyBlock label="Summarize this" onSend={sendReply} />
          <QuickReplyBlock label="Tell me more" onSend={sendReply} />
          <QuickReplyBlock label="Draft a follow-up email" onSend={sendReply} />
        </QuickReplyContainer>
      </div>
    );
  },
};

/**
 * Labels longer than the container width wrap onto multiple lines instead of
 * truncating; the block grows vertically to fit.
 * @summary Long label wrapping onto multiple lines.
 */
export const LongLabelWrapping: Story = {
  args: {
    label:
      "Ask a longer follow-up question that does not fit on one line and wraps",
    onSend: sendReply,
  },
  render: (args) => (
    <QuickReplyContainer className="w-[280px]">
      <QuickReplyBlock {...args} />
    </QuickReplyContainer>
  ),
};

/**
 * A disabled reply stays visible but cannot be tapped — for suggestions that
 * are no longer applicable, or while another send is in flight.
 * @summary Disabled suggested reply.
 */
export const Disabled: Story = {
  args: {
    label: "Escalate to support",
    disabled: true,
    onSend: sendReply,
  },
  render: (args) => (
    <QuickReplyContainer className="w-[280px]">
      <QuickReplyBlock {...args} />
    </QuickReplyContainer>
  ),
};
