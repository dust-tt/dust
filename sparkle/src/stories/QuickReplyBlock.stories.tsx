import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

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

export const Examples: Story = {
  render: () => {
    const [resetKey, setResetKey] = React.useState(0);
    const handleSend = async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 800);
      });
    };

    return (
      <div className="s-flex s-w-[280px] s-flex-col s-gap-3">
        <Button
          variant="outline"
          size="xs"
          label="Re initiate"
          onClick={() => setResetKey((value) => value + 1)}
        />
        <QuickReplyContainer key={resetKey} className="s-w-full">
          <QuickReplyBlock label="Summarize this" onSend={handleSend} />
          <QuickReplyBlock
            label="Ask a longer question that should wrap onto multiple lines"
            onSend={handleSend}
          />
          <QuickReplyBlock label="Sending..." onSend={handleSend} />
          <QuickReplyBlock
            label="Disabled reply"
            disabled
            onSend={handleSend}
          />
        </QuickReplyContainer>
      </div>
    );
  },
};
