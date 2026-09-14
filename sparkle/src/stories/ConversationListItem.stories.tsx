import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  ConversationListItem,
  ListGroup,
  ReplySection,
} from "../index_with_tw_base";

const meta = {
  title: "Lists/ConversationListItem",
  component: ConversationListItem,
  tags: ["a11y-issues", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A list row summarising a conversation, showing its **conversation** title and description, a **time** stamp, and a leading **avatar** (one-on-one) or **creator** portrait (group). An optional **replySection** surfaces reply, unread, and mention counts with participant avatars, and **onClick** opens the thread.

**When to use**
- To render an inbox or activity feed of conversations, threads, or channels.

**Guidelines**
- Pass either **avatar** for direct conversations or **creator** for group conversations, not both.
- Use the **ReplySection** component for the **replySection** slot to display reply / unread / mention counts consistently.
- Group rows inside **ListGroup** so dividers and spacing stay consistent across the list.`,
      },
    },
  },
} satisfies Meta<typeof ConversationListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockConversation = {
  id: "conv-1",
  title: "Project planning discussion",
  description:
    "Let's discuss the roadmap for Q1 and align on priorities for the upcoming sprint.",
  updatedAt: new Date(),
};

const aliceAvatar = {
  name: "Alice",
  visual: "https://i.pravatar.cc/150?img=1",
  isRounded: true,
};

const participantAvatars = [
  aliceAvatar,
  {
    name: "Charlie",
    visual: "https://i.pravatar.cc/150?img=3",
    isRounded: true,
  },
  {
    name: "Diana",
    visual: "https://i.pravatar.cc/150?img=4",
    isRounded: true,
  },
];

const renderInListGroup: Story["render"] = (args) => (
  <ListGroup>
    <ConversationListItem {...args} />
  </ListGroup>
);

/**
 * A direct (one-on-one) conversation: pass `avatar` for the counterpart,
 * mark it `unread`, and surface reply/unread counts via `replySection`.
 *
 * @summary Unread one-on-one conversation with replies.
 */
export const OneOnOneWithReply: Story = {
  args: {
    unread: true,
    conversation: mockConversation,
    avatar: aliceAvatar,
    time: "14:30",
    replySection: (
      <ReplySection
        replyCount={3}
        unreadCount={1}
        avatars={[aliceAvatar]}
        lastMessageBy="Alice"
      />
    ),
    onClick: fn(),
  },
  render: renderInListGroup,
};

/**
 * A group conversation: pass `creator` (not `avatar`) for the person who
 * started the thread, with participant avatars in the reply section.
 *
 * @summary Read group conversation with participants.
 */
export const GroupConversationWithReply: Story = {
  args: {
    unread: false,
    conversation: mockConversation,
    creator: {
      fullName: "Bob",
      portrait: "https://i.pravatar.cc/150?img=2",
    },
    time: "14:30",
    replySection: (
      <ReplySection
        replyCount={5}
        unreadCount={0}
        avatars={participantAvatars}
        lastMessageBy="Diana"
      />
    ),
    onClick: fn(),
  },
  render: renderInListGroup,
};

/**
 * When the user is @-mentioned, `mentionCount` renders alongside the reply
 * and unread counts so the row signals it needs the user's attention.
 *
 * @summary Conversation with pending mentions.
 */
export const WithMentions: Story = {
  args: {
    unread: true,
    conversation: mockConversation,
    creator: {
      fullName: "Bob",
      portrait: "https://i.pravatar.cc/150?img=2",
    },
    time: "14:30",
    replySection: (
      <ReplySection
        replyCount={23}
        unreadCount={4}
        mentionCount={2}
        avatars={participantAvatars}
        lastMessageBy="Alice"
      />
    ),
    onClick: fn(),
  },
  render: renderInListGroup,
};
