import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import { ConversationPicker } from "../index_with_tw_base";

const meta = {
  title: "Components/ConversationPicker",
  component: ConversationPicker,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A compact list of past conversations to resume, shown for instance when a conversation panel opens on an empty state.

**When to use**
- On the empty state of an embedded conversation surface (side panel, popover) so the user can pick up a previous thread instead of starting over.

**Guidelines**
- Pass items most recent first, already filtered to the surface's scope.
- Format **timeLabel** yourself (e.g. "2h", "3d"); the component renders it as-is.
- With an empty **items** array the component renders nothing, so it can be composed unconditionally.`,
      },
    },
  },
} satisfies Meta<typeof ConversationPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A few recent conversations with relative timestamps, under the default label.
 *
 * @summary Recent conversations to resume.
 */
export const Basic: Story = {
  args: {
    items: [
      { id: "c1", title: "Top agents by credit spend", timeLabel: "2h" },
      { id: "c2", title: "Weekly active builders trend", timeLabel: "1d" },
      { id: "c3", title: "March usage vs February", timeLabel: "6d" },
    ],
    onPick: fn(),
  },
  render: (args) => (
    <div className="w-[360px]">
      <ConversationPicker {...args} />
    </div>
  ),
};

/**
 * A custom section label and an item without a timestamp.
 *
 * @summary Custom label, optional timestamps.
 */
export const CustomLabel: Story = {
  args: {
    label: "Pick up where you left off",
    items: [
      { id: "c1", title: "Top agents by credit spend", timeLabel: "2h" },
      { id: "c2", title: "Weekly active builders trend" },
    ],
    onPick: fn(),
  },
  render: (args) => (
    <div className="w-[360px]">
      <ConversationPicker {...args} />
    </div>
  ),
};
