import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Button,
  ConversationPanel,
  Spinner,
  XClose,
} from "../index_with_tw_base";

const meta = {
  title: "Layout/ConversationPanel",
  component: ConversationPanel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A full-height surface with a sticky **header** slot above a **children** body that fills the remaining space.

**When to use**
- For a conversation embedded as a side panel on a product page (e.g. next to Analytics), where the body swaps between an empty composer, a loading state, and a rendered conversation.

**Guidelines**
- Put the panel title and a close action in the **header**.
- Leave loading/empty/error rendering to the caller — this component is pure layout.`,
      },
    },
  },
} satisfies Meta<typeof ConversationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const MockHeader = () => (
  <div className="flex w-full items-center justify-between px-4 py-3">
    <span className="text-sm font-semibold text-foreground">Ask @analyst</span>
    <Button variant="ghost" size="sm" icon={XClose} />
  </div>
);

/**
 * A rendered conversation body inside the panel, header sticky above it.
 *
 * @summary Panel with a rendered conversation.
 */
export const WithContent: Story = {
  args: {
    header: <MockHeader />,
    children: (
      <div className="flex h-full flex-col gap-2 overflow-y-auto p-4">
        <div className="rounded-lg bg-muted-background p-3 text-sm">
          Which agents drove the most credit usage last month?
        </div>
        <div className="rounded-lg bg-highlight/10 p-3 text-sm">
          The top three agents by credits last month were @support,
          @sales-notes, and @analyst.
        </div>
      </div>
    ),
  },
  render: (args) => <ConversationPanel {...args} />,
  decorators: [
    (Story) => (
      <div className="h-[480px] w-[360px] border border-border">
        <Story />
      </div>
    ),
  ],
};

/**
 * The body slot filled with a centered spinner while a conversation is being created.
 *
 * @summary Loading state before the conversation is ready.
 */
export const Loading: Story = {
  args: {
    header: <MockHeader />,
    children: (
      <div className="flex h-full items-center justify-center">
        <Spinner size="md" />
      </div>
    ),
  },
  render: (args) => <ConversationPanel {...args} />,
  decorators: [
    (Story) => (
      <div className="h-[480px] w-[360px] border border-border">
        <Story />
      </div>
    ),
  ],
};
