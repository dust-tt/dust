import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  Avatar,
  Button,
  Chip,
  Clock,
  ConversationListItem,
  Cube01,
  Icon,
  ListGroup,
  Lock01,
  ReplySection,
  XClose,
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
- Use **titleIcon** when the rows are labelled by a category rather than a unique subject, so the title reads as icon plus category.
- Use **leadingVisual** when the avatar itself has to carry the category, as an avatar with a badge; keep **creator** alongside it so the name still sits by the title.
- Use the **ReplySection** component for the **replySection** slot to display reply / unread / mention counts consistently.
- Use **trailing** instead of **time** when the right side of the row has to carry its own state and actions, and stop clicks on those actions from reaching **onClick**.
- Use **label** when the whole row needs a label above its title line, as in a mixed feed where each row says which list it came from.
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

/**
 * `titleIcon` prefixes the title with an icon, for lists whose rows are
 * labelled by a category — here the row's kind, with the person who raised it
 * carried by `creator` and the specifics in the description.
 *
 * @summary Row titled by category rather than subject.
 */
export const WithTitleIcon: Story = {
  args: {
    unread: true,
    conversation: {
      id: "conv-2",
      title: "Pod access",
      description:
        "Access to the Security & Compliance Pod — I'm taking over the SOC 2 evidence collection from Marco.",
      updatedAt: new Date(),
    },
    creator: {
      fullName: "Marco Ferrari",
      portrait: "https://i.pravatar.cc/150?img=5",
    },
    titleIcon: Lock01,
    time: "5h",
    onClick: fn(),
  },
  render: renderInListGroup,
};

/**
 * `trailing` takes the timestamp's place when the right side of the row carries
 * its own state and actions — here what the row is waiting on, and the button
 * that calls it off. Keep the actions out of the row's `onClick` by stopping
 * the click from propagating.
 *
 * @summary Row whose right side holds state and an action.
 */
export const WithTrailing: Story = {
  args: {
    unread: false,
    conversation: {
      id: "conv-4",
      title: "Staging deploy",
      description: "Check whether the staging deploy went through at 17:30.",
      updatedAt: new Date(),
    },
    avatar: aliceAvatar,
    trailing: (
      <>
        <span className="flex items-center gap-1">
          <Icon visual={Clock} size="xs" />
          17:30
        </span>
        <span onClick={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="xs" icon={XClose} tooltip="Dismiss" />
        </span>
      </>
    ),
    onClick: fn(),
  },
  render: renderInListGroup,
};

/**
 * `label` sits above the title line, for a label the whole row answers to —
 * here the list a mixed feed drew the row from, said by a chip.
 *
 * @summary Row labelled above its title line.
 */
export const WithLabel: Story = {
  args: {
    unread: true,
    conversation: {
      id: "conv-5",
      title: "Project Milestone Celebration",
      description:
        "Follow-up conversation about project milestone celebration implementation details.",
      updatedAt: new Date(),
    },
    creator: {
      fullName: "Sari Sari",
      portrait: "https://i.pravatar.cc/150?img=9",
    },
    label: (
      <div className="flex">
        <Chip size="mini" icon={Cube01} label="Mobile Engineering" />
      </div>
    ),
    time: "04:16",
    onClick: fn(),
  },
  render: renderInListGroup,
};

/**
 * `leadingVisual` replaces the avatar with any node, here a portrait badged with
 * the row's category, so the icon travels with the person instead of prefixing
 * the title. `creator` still supplies the name next to the title.
 *
 * @summary Row led by a badged avatar.
 */
export const WithLeadingVisual: Story = {
  args: {
    unread: true,
    conversation: {
      id: "conv-3",
      title: "Pod access",
      description:
        "Access to the Security & Compliance Pod — I'm taking over the SOC 2 evidence collection from Marco.",
      updatedAt: new Date(),
    },
    creator: {
      fullName: "Marco Ferrari",
      portrait: "https://i.pravatar.cc/150?img=5",
    },
    leadingVisual: (
      <div className="relative inline-flex overflow-visible">
        <Avatar
          name="Marco Ferrari"
          visual="https://i.pravatar.cc/150?img=5"
          size="sm"
          isRounded
        />
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-0.5 text-foreground shadow-sm ring-1 ring-border">
          <Lock01 className="h-3 w-3" />
        </span>
      </div>
    ),
    time: "5h",
    onClick: fn(),
  },
  render: renderInListGroup,
};
