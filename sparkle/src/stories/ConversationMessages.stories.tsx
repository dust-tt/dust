import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ActionCardBlock,
  AttachmentChip,
  Avatar,
  BoltIcon,
  Citation,
  CitationIcons,
  CitationTitle,
  DocumentIcon,
  DriveLogo,
  FolderIcon,
  Icon,
  Markdown,
  NotionLogo,
  SlackLogo,
  TableIcon,
} from "../index_with_tw_base";
import {
  ConversationMessageAvatar,
  ConversationMessageContainer,
  ConversationMessageContent,
  ConversationMessageTitle,
} from "../components/ConversationMessages";
import { ConversationContainer } from "../components/ConversationMessage";

const meta = {
  title: "Conversation/ConversationMessages",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Example: Story = {
  render: () => (
    <div className="s-flex s-w-full s-justify-center s-gap-6">
      <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6 s-p-2 @sm/conversation:s-gap-8 @md/conversation:s-gap-10">
        <ConversationMessageContainer messageType="me" type="user">
          <ConversationMessageAvatar
            avatarUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
            name="Edouard"
            type="user"
          />
          <ConversationMessageTitle
            name="Edouard"
            timestamp="14:30"
            renderName={(name) => <span>{name}</span>}
            infoChip={<Icon size="xs" visual={BoltIcon} />}
          />
          <ConversationMessageContent type="user">
            Can you summarize the customer feedback from this week?
          </ConversationMessageContent>
        </ConversationMessageContainer>
        <ConversationMessageContainer messageType="user" type="user">
          <ConversationMessageAvatar
            avatarUrl="https://dust.tt/static/droidavatar/Droid_Green_2.jpg"
            name="Alex"
            type="user"
          />
          <ConversationMessageTitle
            name="Alex"
            timestamp="14:31"
            renderName={(name) => <span>{name}</span>}
          />
          <ConversationMessageContent type="user">
            Yes — also highlight any churn risk from support tickets.
          </ConversationMessageContent>
        </ConversationMessageContainer>
        <ConversationMessageContainer messageType="me" type="user">
          <ConversationMessageAvatar
            avatarUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
            name="Edouard"
            type="user"
          />
          <ConversationMessageTitle
            name="Edouard"
            timestamp="14:32"
            renderName={(name) => <span>{name}</span>}
          />
          <ConversationMessageContent type="user">
            <div className="s-flex s-flex-col s-gap-2">
              <span>Here are the related docs and a drive folder.</span>
              <div className="s-flex s-flex-wrap s-gap-2">
                <AttachmentChip
                  label="Q1_feedback_summary.pdf"
                  icon={{ visual: DocumentIcon }}
                />
                <AttachmentChip
                  label="Customer interviews"
                  doubleIcon={{
                    mainIcon: FolderIcon,
                    secondaryIcon: DriveLogo,
                    size: "sm",
                  }}
                />
              </div>
            </div>
          </ConversationMessageContent>
        </ConversationMessageContainer>
        <ConversationMessageContainer messageType="user" type="user">
          <ConversationMessageAvatar
            avatarUrl="https://dust.tt/static/droidavatar/Droid_Orange_4.jpg"
            name="Maya"
            type="user"
          />
          <ConversationMessageTitle
            name="Maya"
            timestamp="14:33"
            renderName={(name) => <span>{name}</span>}
          />
          <ConversationMessageContent type="user">
            <div className="s-flex s-flex-col s-gap-2">
              <span>Adding meeting notes from last week.</span>
              <div className="s-flex s-flex-wrap s-gap-2">
                <AttachmentChip
                  label="Notes — Interviews"
                  doubleIcon={{
                    mainIcon: DocumentIcon,
                    secondaryIcon: NotionLogo,
                    size: "sm",
                  }}
                  href="https://notion.so"
                  target="_blank"
                />
              </div>
            </div>
          </ConversationMessageContent>
        </ConversationMessageContainer>

        <ConversationMessageContainer messageType="agent" type="agent">
          <ConversationMessageAvatar
            avatarUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
            name="@agent"
            type="agent"
          />
          <ConversationMessageTitle
            name="@agent"
            timestamp="14:31"
            renderName={(name) => <span>{name}</span>}
            completionStatus={
              <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                Completed in 18 sec
              </span>
            }
          />
          <ConversationMessageContent
            type="agent"
            citations={[
              <Citation key="table">
                <CitationIcons>
                  <Icon visual={TableIcon} size="sm" />
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
            <Markdown content={exampleShort} />
          </ConversationMessageContent>
        </ConversationMessageContainer>

        <ConversationMessageContainer messageType="agent" type="agent">
          <ConversationMessageAvatar
            avatarUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
            name="@agent"
            type="agent"
          />
          <ConversationMessageTitle
            name="@agent"
            timestamp="14:33"
            renderName={(name) => <span>{name}</span>}
            completionStatus={
              <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
                <Avatar size="sm" emoji="🗞️" backgroundColor="s-bg-blue-100" />
              }
            />
          </ConversationMessageContent>
        </ConversationMessageContainer>

        <ConversationMessageContainer messageType="agent" type="agent">
          <ConversationMessageAvatar
            avatarUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
            name="@agent"
            type="agent"
          />
          <ConversationMessageTitle
            name="@agent"
            timestamp="14:34"
            renderName={(name) => <span>{name}</span>}
            completionStatus={
              <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                Completed in 46 sec
              </span>
            }
          />
          <ConversationMessageContent
            type="agent"
            citations={[
              <Citation key="long-table">
                <CitationIcons>
                  <Icon visual={TableIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>Support queue trends</CitationTitle>
              </Citation>,
              <Citation key="long-slack">
                <CitationIcons>
                  <Icon visual={SlackLogo} size="sm" />
                </CitationIcons>
                <CitationTitle>Customer feedback summary</CitationTitle>
              </Citation>,
            ]}
          >
            <Markdown content={exampleLong} />
            <ActionCardBlock
              title="Link Drive folder for raw notes"
              description="Connect the folder so I can attach source links in responses."
              applyLabel="Connect"
              rejectLabel="Skip"
              cardVariant="secondary"
              visual={
                <Avatar size="sm" emoji="📁" backgroundColor="s-bg-green-100" />
              }
            />
          </ConversationMessageContent>
        </ConversationMessageContainer>
      </div>
    </div>
  ),
};

const exampleShort = `
Highlights from this week:
- Customers love the faster search results.
- The onboarding checklist is now clearer.
- A few requests asked for dark mode improvements.
`;

const exampleLong = `
**Weekly summary (highlights + risks)**

Top positives:
- Search feels faster (especially on large workspaces).
- Onboarding checklist is clearer and reduces first-day confusion.

Risks to watch:
- A handful of teams requested better dark mode contrast.
- Two enterprise accounts asked for audit log export frequency.

**Churn risk signals**
1. "Multiple admins can't find settings" appears in 3 tickets.
2. "Latency spikes in threads with many citations" noted twice.

**Suggested follow-ups**
- Share a quick dark mode roadmap update.
- Add a tooltip in settings for export cadence.
- Confirm whether the citation rendering delay is reproducible.

\`\`\`
Next step checklist
[ ] Triage dark mode issues
[ ] Export cadence FAQ update
[ ] Run perf test on long threads
\`\`\`
`;
