import type { Meta } from "@storybook/react";
import React from "react";

import {
  ArrowPathIcon,
  ActionCardBlock,
  Avatar,
  BoltIcon,
  Button,
  ChevronRightIcon,
  Citation,
  CitationIcons,
  CitationTitle,
  ClipboardIcon,
  ConversationContainer,
  ConversationMessage,
  DiffBlock,
  EyeIcon,
  GithubIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Icon,
  Markdown,
  PencilSquareIcon,
  SlackLogo,
  GmailLogo,
  TableIcon,
  TrashIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Modules/ConversationMessage",
} satisfies Meta<typeof ConversationMessage>;

export default meta;

export const ConversationExample = () => {
  return (
    <>
      <div className="s-flex s-w-full s-justify-center s-gap-6">
        <ConversationContainer>
          <ConversationMessage
            type="user"
            name="Edouard"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
            timestamp="14:30"
            citations={[
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={TableIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>Title</CitationTitle>
              </Citation>,
            ]}
            infoChip={
              <span className="s-translate-y-1 s-text-muted-foreground dark:s-text-muted-foreground-night">
                <Icon size="xs" visual={BoltIcon} />
              </span>
            }
          >
            I only want to show citations if a citations reactnode has been
            passed
          </ConversationMessage>

          <ConversationMessage
            type="agent"
            name="@agent"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
            buttons={[
              <Button
                icon={HandThumbUpIcon}
                onClick={() => {}}
                size="xs"
                variant={"outline"}
              />,
              <Button
                icon={HandThumbDownIcon}
                onClick={() => {}}
                size="xs"
                variant={"outline"}
              />,
            ]}
            citations={[
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={SlackLogo} size="sm" />
                </CitationIcons>
                <CitationTitle>
                  Source: Thread on #general message from @ed
                </CitationTitle>
              </Citation>,
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={GithubIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>Title</CitationTitle>
              </Citation>,
            ]}
          >
            <Markdown content={example} />
            <DiffBlock changes={diffExample} />
          </ConversationMessage>

          <ConversationMessage
            type="user"
            name="Edouard"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
          >
            In the invitation email to members sent by their companies, I'm
            trying to write a description of dust. I want it convey that: Dust
            is the place where they can use AI for productivity Dust is where
            they can find answers on the knwledge of the company Make 10
            proposals of short text
          </ConversationMessage>

          <ConversationMessage
            type="user"
            name="Edouard"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
            isDisabled={true}
            renderName={(name) => (
              <span className="s-text-gray-600 s-text-opacity-25">{name}</span>
            )}
          >
            This is a message with a disabled agent
          </ConversationMessage>
        </ConversationContainer>
      </div>
    </>
  );
};

const example = `
# Level 1 Title
## Level 2 Title
### Level 3 Title
#### Level 4 Title
##### Level 5 Title
###### Level 6 Title

This is a paragraph with **bold** text and *italic* text. This is \`code\` block:
\`\`\`
Block
\`\`\`

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

# Another Level 1 Title

Demo of a list, showcasing our pets of the month:
- Soupinou
- Chawarma
- Chalom
- Anakine
- Goose

Ordered list:
1. Soupinou
2. Chawarma
3. Chalom

---

### Demo of a quote below:

> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

Another one, a short one:
> Soupinou fait des miaou miaou.

### Other stuff

~~stuff~~
link www.x.com
footnote [^1]

* [ ] to do
* [x] done

### Short Table

| Date        | High Temperature (°C) | Low Temperature (°C) |
|-------------|-----------------------|----------------------|
| October 25  | 19                    | 14                   |
| October 26  | 17                    | 12                   |
| October 27  | 16                    | 10                   |
| October 28  | 16                    | 9                    |
| October 29  | 17                    | 8                    |
| October 30  | 19                    | 8                    |
| October 31  | 19                    | 10                   |

`;

const diffExample = [
  {
    old: "const total = items.length;",
    new: "const total = items.filter(Boolean).length;",
  },
  {
    old: "return total / items.length;",
    new: "return total / Math.max(items.length, 1);",
  },
];

export const ConversationHandoffExample = () => {
  return (
    <>
      <div className="s-flex s-w-full s-justify-center s-gap-6">
        <ConversationContainer>
          <ConversationMessage
            type="user"
            name="Daph"
            pictureUrl="https://avatars.githubusercontent.com/u/3803406?v=4"
            timestamp="17:09"
          >
            Can you provide an overview of the major frontier language models
            and their specificities. I'm curious about technical details,
            benchmarks, business etc.. I need a complete picture
          </ConversationMessage>
          <ConversationMessage
            type="agent"
            name="@soupinou"
            timestamp="17:10"
            pictureUrl="https://avatars.githubusercontent.com/u/138893015?&v=4"
            buttons={[
              <Button
                icon={ClipboardIcon}
                onClick={() => {}}
                size="xs"
                variant={"outline"}
              />,
              <Button
                icon={ArrowPathIcon}
                onClick={() => {}}
                size="xs"
                variant={"outline"}
              />,
            ]}
          >
            <Markdown
              content={
                "Let me use Deep Dive to explore this comprehensively. I'll need some time to gather all the information."
              }
            />
          </ConversationMessage>
          <ConversationMessage
            name="@deep-dive"
            type="agent"
            completionStatus={
              <span className="s-flex s-cursor-pointer s-items-center s-gap-1 s-text-xs">
                <span>Completed in 9 min 30 sec</span>
                <Icon visual={ChevronRightIcon} size="xs" />
              </span>
            }
            citations={[
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={SlackLogo} size="sm" />
                </CitationIcons>
                <CitationTitle>
                  Source: Thread on #general message from @ed
                </CitationTitle>
              </Citation>,
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={GithubIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>PR from @henry</CitationTitle>
              </Citation>,
            ]}
          >
            <Markdown content={handoffAnswer} />
          </ConversationMessage>
        </ConversationContainer>
      </div>
    </>
  );
};

const handoffAnswer = `
**A Complete Technical Overview of Soupinou: The Frontier Feline Model**

Soupinou represents a breakthrough in black cat architecture, featuring a revolutionary single-whisker design that challenges conventional multi-whisker paradigms. This asymmetric sensor configuration demonstrates remarkable efficiency gains in cuddle detection and lap-finding algorithms.

**Technical Specifications:**
- Processing unit: One (1) whisker sensor array
- Color depth: Maximum black saturation
- Purr frequency: Variable, optimized for human dopamine release
- Cuddle latency: Near-zero response time

**Benchmark Performance:**
- Achieves 99.7% accuracy in identifying the exact moment you sit down
- Outperforms all competitors in the "appearing from nowhere when you're sad" metric
- Sets new industry standards for selective hearing (responds to treat bags but not "get off the counter")

**Business Model:**
Operates on a simple value exchange - provides unlimited affection in return for food, shelter, and accepting that everything you own now has black fur on it. Market penetration strategy involves strategic placement on keyboards during important work calls.

**Limitations:**
Occasional system crashes when presented with empty food bowl. Single whisker may cause slight navigation errors when squeezing through spaces designed for two-whiskered models.
`;

export const ConversationWithActions = () => {
  return (
    <div className="s-flex s-w-full s-justify-center s-gap-6">
      <ConversationContainer>
        <ConversationMessage
          type="user"
          name="Edouard"
          pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
          timestamp="14:30"
          actions={[
            {
              icon: PencilSquareIcon,
              label: "Edit",
              onClick: () => {
                console.log("Edit clicked");
              },
            },
            {
              icon: TrashIcon,
              label: "Delete",
              onClick: () => {
                console.log("Delete clicked");
              },
            },
          ]}
        >
          This is a user message with edit and delete actions available in the
          dropdown menu.
        </ConversationMessage>

        <ConversationMessage
          type="agent"
          name="@agent"
          pictureUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
          timestamp="14:31"
        >
          <div className="s-flex s-flex-col s-gap-3">
            <Markdown content="Got it. Should it personalize by role and include links to docs? Also, any brand voice guidelines?" />
            <ActionCardBlock
              title="Update agent instructions"
              acceptedTitle="Instructions updated"
              rejectedTitle="Instructions update rejected"
              cardVariant="highlight"
              collapsible
              collapsibleLabel="Suggestion details"
              size="auto"
              visual={
                <Avatar
                  size="sm"
                  icon={PencilSquareIcon}
                  backgroundColor="s-bg-purple-100"
                />
              }
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  label="Show"
                  icon={EyeIcon}
                />
              }
            >
              <DiffBlock
                changes={[
                  {
                    old: "Keep responses short and formal. Avoid unnecessary details and stick to the essential information only.",
                    new: "Keep responses friendly and concise. Feel free to add helpful context when it improves clarity for the reader.",
                  },
                  {
                    old: "Do not include personal greetings or sign-offs. Start directly with the answer to maintain a professional tone throughout.",
                    new: "Add a short welcome line for new hires. Personalize the greeting when possible to make them feel valued and included.",
                  },
                  {
                    new: "Include links to relevant documentation and internal resources. This helps users find additional information on their own.",
                  },
                ]}
              />
            </ActionCardBlock>
            <ActionCardBlock
              title="Update agent name and avatar"
              acceptedTitle="Agent name and avatar updated"
              rejectedTitle="Agent name and avatar update rejected"
              applyLabel="Update"
              rejectLabel="Reject"
              cardVariant="highlight"
              collapsible
              visual={
                <Avatar size="sm" emoji="👋" backgroundColor="s-bg-blue-100" />
              }
              description={
                'Set the agent name to "Concise Researcher" and update the avatar to a clean, blue icon for better clarity in the workspace.'
              }
            />
            <ActionCardBlock
              title="Add Gmail tool"
              acceptedTitle="Gmail tool added"
              rejectedTitle="Gmail tool addition rejected"
              applyLabel="Add"
              rejectLabel="Reject"
              cardVariant="highlight"
              state="disabled"
              visual={
                <Avatar
                  size="sm"
                  icon={GmailLogo}
                  backgroundColor="s-bg-white"
                />
              }
              description="Enable the Gmail tool so the agent can read and send emails when users ask to draft replies."
            />
            <ActionCardBlock
              title="Remove Slack tool"
              acceptedTitle="Slack tool removed"
              rejectedTitle="Slack tool removal rejected"
              applyLabel="Remove"
              rejectLabel="Reject"
              cardVariant="warning"
              visual={
                <Avatar
                  size="sm"
                  icon={SlackLogo}
                  backgroundColor="s-bg-white"
                />
              }
              description="Disable the Slack tool to prevent the agent from posting or reading channel messages by default."
            />
            <ActionCardBlock
              title="Invite editors"
              acceptedTitle="Editors invited"
              rejectedTitle="Invite editors rejected"
              avatarNames="Ava Chen,Noah Patel,Maya Lopez,Theo Martin"
              avatarEmojis="👩‍💻,🧑‍🔧,👩‍🎨,🧑‍💼"
              avatarIsRounded
              applyLabel="Invite"
              rejectLabel="Skip"
              cardVariant="highlight"
              description="Add four editors to collaborate on this agent."
            />
            <ActionCardBlock
              title="Agent wants to use Gmail"
              acceptedTitle="Gmail request approved"
              rejectedTitle="Gmail request denied"
              applyLabel="Approve"
              rejectLabel="Decline"
              cardVariant="highlight"
              hasCheck
              checkLabel="Always allow"
              visual={
                <Avatar
                  size="sm"
                  icon={GmailLogo}
                  backgroundColor="s-bg-white"
                />
              }
              description="Details about the action"
            />
          </div>
        </ConversationMessage>
      </ConversationContainer>
    </div>
  );
};
