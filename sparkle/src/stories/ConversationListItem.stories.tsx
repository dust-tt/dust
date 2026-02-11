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
