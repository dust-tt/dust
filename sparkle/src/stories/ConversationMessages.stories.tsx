import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ActionCardBlock,
  AttachmentChip,
  Avatar,
  Citation,
  CitationIcons,
  CitationTitle,
  DriveLogo,
  File02,
  Folder,
  Icon,
  Markdown,
  NotionLogo,
  SlackLogo,
  Table,
} from "../index_with_tw_base";
import {
  ConversationMessageAvatar,
  ConversationMessageContainer,
  ConversationMessageContent,
  ConversationMessageTitle,
} from "../components/ConversationMessages";

const meta = {
  title: "Product/Conversation/ConversationMessages",
  parameters: {
    docs: {
      description: {
        component: `The building blocks for laying out a chat thread of user and agent messages. Compose each turn from **ConversationMessageContainer** (with \`messageType\` and \`type\` to distinguish user vs. agent), **ConversationMessageAvatar**, **ConversationMessageTitle** (name, timestamp, optional \`infoChip\` and \`completionStatus\`), and **ConversationMessageContent** (which accepts message body plus a \`citations\` array).

**When to use**
- To render a full conversation between people and agents, including attachments, citations, and action cards.

**Guidelines**
- Set both \`messageType\` and \`type\` on the container so user and agent messages are styled and aligned correctly.
- Put **Markdown** in the content for agent text, pass source references through the \`citations\` prop (using **Citation**), and embed **AttachmentChip** or **ActionCardBlock** inline as needed.
- Use \`completionStatus\` on the title for agent timing/approval states rather than inventing custom labels.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const USER_AVATAR_URL = "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg";
const AGENT_AVATAR_URL = "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg";

const agentReplyMarkdown = `
Highlights from this week:
- Customers love the faster search results.
- The onboarding checklist is now clearer.
- A few requests asked for dark mode improvements.
`;

// Thread layout shared by every story, matching the product's conversation
// column (centered, capped width, responsive gap).
function Thread({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full justify-center gap-6">
      <div className="flex w-full max-w-4xl flex-col gap-6 p-2 @sm-conversation:gap-8 @md-conversation:gap-10">
        {children}
      </div>
    </div>
  );
}

/**
 * The minimal thread: one user turn (`messageType="me"`) answered by one agent
 * turn, with a `completionStatus` label on the agent's title.
 * @summary Minimal user question and agent reply.
 */
export const UserAgentExchange: Story = {
  render: () => (
    <Thread>
      <ConversationMessageContainer messageType="me" type="user">
        <ConversationMessageAvatar
          avatarUrl={USER_AVATAR_URL}
          name="Edouard"
          type="user"
        />
        <ConversationMessageTitle
          name="Edouard"
          timestamp="14:30"
          renderName={(name) => <span>{name}</span>}
        />
        <ConversationMessageContent type="user">
          Can you summarize the customer feedback from this week?
        </ConversationMessageContent>
      </ConversationMessageContainer>
      <ConversationMessageContainer messageType="agent" type="agent">
        <ConversationMessageAvatar
          avatarUrl={AGENT_AVATAR_URL}
          name="@agent"
          type="agent"
        />
        <ConversationMessageTitle
          name="@agent"
          timestamp="14:31"
          renderName={(name) => <span>{name}</span>}
          completionStatus={
            <span className="text-xs text-muted-foreground">
              Completed in 18 sec
            </span>
          }
        />
        <ConversationMessageContent type="agent">
          <Markdown content={agentReplyMarkdown} />
        </ConversationMessageContent>
      </ConversationMessageContainer>
    </Thread>
  ),
};

/**
 * A user message carrying files and connected resources as **AttachmentChip**s
 * (single icon, doubleIcon for a platform-scoped resource, and a linked chip).
 * @summary User message with attachment chips.
 */
export const WithAttachments: Story = {
  render: () => (
    <Thread>
      <ConversationMessageContainer messageType="me" type="user">
        <ConversationMessageAvatar
          avatarUrl={USER_AVATAR_URL}
          name="Edouard"
          type="user"
        />
        <ConversationMessageTitle
          name="Edouard"
          timestamp="14:32"
          renderName={(name) => <span>{name}</span>}
        />
        <ConversationMessageContent type="user">
          <div className="flex flex-col gap-2">
            <span>Here are the related docs and a drive folder.</span>
            <div className="flex flex-wrap gap-2">
              <AttachmentChip
                label="Q1_feedback_summary.pdf"
                icon={{ visual: File02 }}
              />
              <AttachmentChip
                label="Customer interviews"
                doubleIcon={{
                  mainIcon: Folder,
                  secondaryIcon: DriveLogo,
                  size: "sm",
                }}
              />
              <AttachmentChip
                label="Notes — Interviews"
                doubleIcon={{
                  mainIcon: File02,
                  secondaryIcon: NotionLogo,
                  size: "sm",
                }}
                href="https://app.notion.com"
                target="_blank"
              />
            </div>
          </div>
        </ConversationMessageContent>
      </ConversationMessageContainer>
    </Thread>
  ),
};

/**
 * An agent message whose sources are passed through the content's `citations`
 * prop as **Citation** elements, rendered alongside the Markdown body.
 * @summary Agent message with source citations.
 */
export const WithCitations: Story = {
  render: () => (
    <Thread>
      <ConversationMessageContainer messageType="agent" type="agent">
        <ConversationMessageAvatar
          avatarUrl={AGENT_AVATAR_URL}
          name="@agent"
          type="agent"
        />
        <ConversationMessageTitle
          name="@agent"
          timestamp="14:31"
          renderName={(name) => <span>{name}</span>}
          completionStatus={
            <span className="text-xs text-muted-foreground">
              Completed in 18 sec
            </span>
          }
        />
        <ConversationMessageContent
          type="agent"
          citations={[
            <Citation key="table">
              <CitationIcons>
                <Icon visual={Table} size="sm" />
              </CitationIcons>
              <CitationTitle>Weekly support report</CitationTitle>
            </Citation>,
            <Citation key="slack">
              <CitationIcons>
                <Icon visual={SlackLogo} size="sm" />
              </CitationIcons>
              <CitationTitle>Thread in #feedback</CitationTitle>
            </Citation>,
          ]}
        >
          <Markdown content={agentReplyMarkdown} />
        </ConversationMessageContent>
      </ConversationMessageContainer>
    </Thread>
  ),
};

/**
 * An agent message embedding an **ActionCardBlock** proposal in its content,
 * paired with an "Awaiting approval" `completionStatus` on the title.
 * @summary Agent message with an embedded action card.
 */
export const WithActionCards: Story = {
  render: () => (
    <Thread>
      <ConversationMessageContainer messageType="agent" type="agent">
        <ConversationMessageAvatar
          avatarUrl={AGENT_AVATAR_URL}
          name="@agent"
          type="agent"
        />
        <ConversationMessageTitle
          name="@agent"
          timestamp="14:33"
          renderName={(name) => <span>{name}</span>}
          completionStatus={
            <span className="text-xs text-muted-foreground">
              Awaiting approval
            </span>
          }
        />
        <ConversationMessageContent type="agent">
          <ActionCardBlock
            title="Enable weekly feedback digest"
            description="Share a Monday summary of sentiment and top requests with the team."
            applyLabel="Enable"
            rejectLabel="Not now"
            cardVariant="highlight"
            actionsPosition="header"
            visual={
              <Avatar size="sm" emoji="🗞️" backgroundColor="bg-blue-100" />
            }
          />
        </ConversationMessageContent>
      </ConversationMessageContainer>
    </Thread>
  ),
};
