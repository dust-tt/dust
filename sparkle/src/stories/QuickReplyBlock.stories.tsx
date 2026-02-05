import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Button,
  QuickReplyBlock,
  QuickReplyContainer,
} from "../index_with_tw_base";

const meta: Meta<typeof QuickReplyBlock> = {
  title: "Conversation/QuickReplyBlock",
  component: QuickReplyBlock,
  parameters: {
    layout: "centered",
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
