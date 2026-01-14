import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Avatar,
  ConversationListItem,
  ListGroup,
  ListItemSection,
} from "../index_with_tw_base";

const meta = {
  title: "Components/ConversationListItem",
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

const mockConversationNoDescription = {
  id: "conv-2",
  title: "Quick question about the API",
  updatedAt: new Date(),
};

export const OneOnOneConversation: Story = {
  args: {},
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
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

export const OneOnOneWithReply: Story = {
  args: {},
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
          <span className="s-font-normal">Last reply 5 minutes ago</span>
        }
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

export const OneOnOneWithCounter: Story = {
  args: {},
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
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

export const GroupConversation: Story = {
  args: {},
  render: () => (
    <ListGroup>
      <ConversationListItem
        conversation={mockConversation}
        creator={{
          fullName: "Bob",
          portrait: "https://i.pravatar.cc/150?img=2",
        }}
        time="14:30"
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

export const GroupConversationWithReply: Story = {
  args: {},
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
          <>
            <Avatar.Stack
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
              nbVisibleItems={3}
              onTop="first"
              size="xs"
            />
            5 replies.
            <span className="s-font-normal">
              {" "}
              Last from @seb 5 minutes ago.
            </span>
          </>
        }
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

export const AgentConversation: Story = {
  args: {},
  render: () => (
    <ListGroup>
      <ConversationListItem
        conversation={mockConversation}
        avatar={{
          name: "Assistant",
          emoji: "🤖",
          backgroundColor: "#FF6B6B",
          isRounded: false,
        }}
        time="14:30"
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

export const WithoutDescription: Story = {
  args: {},
  render: () => (
    <ListGroup>
      <ConversationListItem
        conversation={mockConversationNoDescription}
        avatar={{
          name: "Alice",
          visual: "https://i.pravatar.cc/150?img=1",
          isRounded: true,
        }}
        time="14:30"
        onClick={() => console.log("Clicked")}
      />
    </ListGroup>
  ),
};

export const WithDateSections: Story = {
  args: {},
  render: () => (
    <div className="s-flex s-flex-col">
      <ListItemSection>Today</ListItemSection>
      <ListGroup>
        <ConversationListItem
          conversation={mockConversation}
          avatar={{
            name: "Alice",
            visual: "https://i.pravatar.cc/150?img=1",
            isRounded: true,
          }}
          time="14:30"
          onClick={() => console.log("Clicked")}
        />
        <ConversationListItem
          conversation={mockConversationNoDescription}
          avatar={{
            name: "Bob",
            visual: "https://i.pravatar.cc/150?img=2",
            isRounded: true,
          }}
          time="12:15"
          onClick={() => console.log("Clicked")}
        />
      </ListGroup>
      <ListItemSection>Yesterday</ListItemSection>
      <ListGroup>
        <ConversationListItem
          conversation={mockConversation}
          creator={{
            fullName: "Charlie",
            portrait: "https://i.pravatar.cc/150?img=3",
          }}
          time="16:45"
          replySection={
            <>
              <Avatar.Stack
                avatars={[
                  {
                    name: "Alice",
                    visual: "https://i.pravatar.cc/150?img=1",
                    isRounded: true,
                  },
                  {
                    name: "Bob",
                    visual: "https://i.pravatar.cc/150?img=2",
                    isRounded: true,
                  },
                ]}
                nbVisibleItems={2}
                onTop="first"
                size="xs"
              />
              2 replies.
              <span className="s-font-normal">
                {" "}
                Last from @alice 2 hours ago.
              </span>
            </>
          }
          onClick={() => console.log("Clicked")}
        />
      </ListGroup>
    </div>
  ),
};
