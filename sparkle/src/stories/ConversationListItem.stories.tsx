import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ConversationListItem,
  ListGroup,
  ReplySection,
} from "../index_with_tw_base";

const meta = {
  title: "List/ConversationListItem",
  component: ConversationListItem,
  tags: ["autodocs"],
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

export const OneOnOneWithReply: Story = {
  args: {
    conversation: mockConversation,
    time: "14:30",
  },
  render: () => (
    <ListGroup>
      <ConversationListItem
        conversation={mockConversation}
        avatar={{
          name: "Alice",
          visual: "https://i.pravatar.cc/150?img=1",
          isRounded: true,
        }}
        time="14:30"
        replySection={
          <ReplySection
            replyCount={3}
            unreadCount={1}
            avatars={[
              {
                name: "Alice",
                visual: "https://i.pravatar.cc/150?img=1",
                isRounded: true,
              },
            ]}
            lastMessageBy="Alice"
          />
        }
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

export const GroupConversationWithReply: Story = {
  args: {
    conversation: mockConversation,
    time: "14:30",
  },
  render: () => (
    <ListGroup>
      <ConversationListItem
        conversation={mockConversation}
        creator={{
          fullName: "Bob",
          portrait: "https://i.pravatar.cc/150?img=2",
        }}
        time="14:30"
        replySection={
          <ReplySection
            replyCount={5}
            unreadCount={0}
            avatars={[
              {
                name: "Alice",
                visual: "https://i.pravatar.cc/150?img=1",
                isRounded: true,
              },
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
            ]}
            lastMessageBy="seb"
          />
        }
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

const mentionAvatars = [
  {
    name: "Alice",
    visual: "https://i.pravatar.cc/150?img=1",
    isRounded: true,
  },
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

export const WithMentions: Story = {
  args: {
    conversation: mockConversation,
    time: "14:30",
  },
  render: () => (
    <ListGroup>
      {/* 2 Mentions on 4 unreads (23 replies) */}
      <ConversationListItem
        conversation={{
          ...mockConversation,
          title: "All different counts",
        }}
        creator={{
          fullName: "Bob",
          portrait: "https://i.pravatar.cc/150?img=2",
        }}
        time="14:30"
        replySection={
          <ReplySection
            replyCount={23}
            unreadCount={4}
            mentionCount={2}
            avatars={mentionAvatars}
            lastMessageBy="Alice"
          />
        }
        onClick={() => console.log("Clicked")}
      />
      {/* 2 Mentions (5 replies) — mentions == unreads */}
      <ConversationListItem
        conversation={{
          ...mockConversation,
          title: "Mentions equal unreads",
        }}
        creator={{
          fullName: "Charlie",
          portrait: "https://i.pravatar.cc/150?img=3",
        }}
        time="12:00"
        replySection={
          <ReplySection
            replyCount={5}
            unreadCount={2}
            mentionCount={2}
            avatars={mentionAvatars}
            lastMessageBy="Diana"
          />
        }
        onClick={() => console.log("Clicked")}
      />
      {/* 2 Mentions on 4 unreads — unreads == replies */}
      <ConversationListItem
        conversation={{
          ...mockConversation,
          title: "Unreads equal replies",
        }}
        creator={{
          fullName: "Diana",
          portrait: "https://i.pravatar.cc/150?img=4",
        }}
        time="09:15"
        replySection={
          <ReplySection
            replyCount={4}
            unreadCount={4}
            mentionCount={2}
            avatars={mentionAvatars}
            lastMessageBy="Charlie"
          />
        }
        onClick={() => console.log("Clicked")}
      />
      {/* 2 Mentions — all counts equal */}
      <ConversationListItem
        conversation={{
          ...mockConversation,
          title: "All counts equal",
        }}
        creator={{
          fullName: "Alice",
          portrait: "https://i.pravatar.cc/150?img=1",
        }}
        time="08:00"
        replySection={
          <ReplySection
            replyCount={2}
            unreadCount={2}
            mentionCount={2}
            avatars={mentionAvatars}
            lastMessageBy="Bob"
          />
        }
        onClick={() => console.log("Clicked")}
      />
      {/* 1 Mention — singular */}
      <ConversationListItem
        conversation={{
          ...mockConversation,
          title: "Single mention",
        }}
        creator={{
          fullName: "Alice",
          portrait: "https://i.pravatar.cc/150?img=1",
        }}
        time="07:45"
        replySection={
          <ReplySection
            replyCount={1}
            unreadCount={1}
            mentionCount={1}
            avatars={mentionAvatars}
            lastMessageBy="Alice"
          />
        }
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};
