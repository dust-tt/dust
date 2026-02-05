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
  NewConversationContainer,
  NewConversationMessageContainer,
  NewConversationMessageGroup,
} from "../components/NewConversationMessages";

const meta = {
  title: "Conversation/NewConversationMessages",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Example: Story = {
  render: () => (
    <div className="s-flex s-w-full s-justify-center s-gap-6">
      <NewConversationContainer>
        <NewConversationMessageGroup
          type="locutor"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
          name="David"
          timestamp="09:10"
          infoChip={
            <span className="s-translate-y-0.5 s-text-muted-foreground dark:s-text-muted-foreground-night">
              <Icon size="xs" visual={BoltIcon} />
            </span>
          }
          renderName={(name) => <span>{name}</span>}
        >
          <NewConversationMessageContainer>
            We need the ending to feel inevitable without rushing the turn.
            Everyone keeps calling out the pacing.
            <p className="s-font-semibold s-mt-2">Paste from draft scene:</p>
            <p className="s-mt-1">
              "You told me love was the death of duty," he says, quiet, like he
              is speaking to the stones. "Then you asked me to choose. There is
              no choice if the world burns either way."
            </p>
            <p className="s-mt-2">
              She doesn't answer. The ash floats between them like snowfall, and
              the throne is just a shape in the haze.
            </p>
          </NewConversationMessageContainer>
          <NewConversationMessageContainer>
            Can we map out the key beats we have to honor and where we can
            breathe?
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>

        <NewConversationMessageGroup
          type="interlocutor"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Green_2.jpg"
          name="Dan"
          timestamp="09:12"
          renderName={(name) => <span>{name}</span>}
        >
          <NewConversationMessageContainer>
            Agreed. If we keep the throne room, we need sharper setup for why
            she crosses the line and how Jon processes it.
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>

        <NewConversationMessageGroup
          type="interlocutor"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Orange_4.jpg"
          name="Bryan"
          timestamp="09:14"
          renderName={(name) => <span>{name}</span>}
        >
          <NewConversationMessageContainer>
            I pulled the outline beats from last season and flagged the
            emotional pivots that felt underwritten.
          </NewConversationMessageContainer>
          <NewConversationMessageContainer>
            If we can intercut the northern reactions and Varys’s letters, it
            gives us more weight before the snap.
            <p className="s-font-semibold s-mt-2">Dialogue beat:</p>
            <p className="s-mt-1">
              "What do you call a queen who frees us and then chains us to her
              grief?" Davos asks.
            </p>
            <p className="s-mt-2">
              "You call her a warning," Gilly says, and the room goes still.
            </p>
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>

        <NewConversationMessageGroup
          type="locutor"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
          name="David"
          timestamp="09:16"
          renderName={(name) => <span>{name}</span>}
        >
          <NewConversationMessageContainer>
            Sharing the latest rewrite notes and the blocking sketch for the
            throne room. Let me know what feels off.
          </NewConversationMessageContainer>
          <NewConversationMessageContainer>
            <div className="s-flex s-flex-col s-gap-2">
              <div className="s-flex s-flex-wrap s-gap-2">
                <AttachmentChip
                  label="Finale_rewrite_notes.docx"
                  icon={{ visual: DocumentIcon }}
                />
                <AttachmentChip
                  label="ThroneRoom_blocking.png"
                  icon={{ visual: DocumentIcon }}
                />
                <AttachmentChip
                  label="Dragonpit_scene.png"
                  icon={{ visual: DocumentIcon }}
                />
              </div>
            </div>
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>

        <NewConversationMessageGroup
          type="interlocutor"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Green_2.jpg"
          name="Jane"
          timestamp="09:18"
          renderName={(name) => <span>{name}</span>}
        >
          <NewConversationMessageContainer>
            I like the council ending, but we need a stronger reason for the
            vote to land on Bran. It can’t feel like a twist for twist’s sake.
            <p className="s-font-semibold s-mt-2">Council snippet:</p>
            <p className="s-mt-1">
              "If the wheel is broken," Sansa says, "then let the memory of the
              wheel judge us."
            </p>
            <p className="s-mt-2">
              Tyrion looks to Bran. "He doesn't want power," he says. "Which is
              exactly why he should hold it."
            </p>
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>

        <NewConversationMessageGroup
          type="interlocutor"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Orange_4.jpg"
          name="Bryan"
          timestamp="09:19"
          renderName={(name) => <span>{name}</span>}
        >
          <NewConversationMessageContainer>
            Maybe we seed the “memory as power” idea earlier. A short beat
            between Tyrion and Bran about stories outlasting kings.
          </NewConversationMessageContainer>
          <NewConversationMessageContainer>
            I can pull relevant scenes from season two and five to echo it.
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>

        <NewConversationMessageGroup
          type="agent"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
          name="@agent"
          timestamp="09:20"
          renderName={(name) => <span>{name}</span>}
          completionStatus={
            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              Completed in 22 sec
            </span>
          }
        >
          <NewConversationMessageContainer
            citations={[
              <Citation key="outline">
                <CitationIcons>
                  <Icon visual={TableIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>Season 8 outline beats</CitationTitle>
              </Citation>,
              <Citation key="letters">
                <CitationIcons>
                  <Icon visual={SlackLogo} size="sm" />
                </CitationIcons>
                <CitationTitle>Varys letters montage</CitationTitle>
              </Citation>,
            ]}
          >
            <Markdown content={exampleShort} />
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>

        <NewConversationMessageGroup
          type="agent"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
          name="@agent"
          timestamp="09:22"
          renderName={(name) => <span>{name}</span>}
          completionStatus={
            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              Awaiting approval
            </span>
          }
        >
          <NewConversationMessageContainer>
            <div className="s-flex s-flex-col s-gap-3">
              <ActionCardBlock
                title="Add Bran foreshadowing beat"
                description="Insert a short scene in episode 5 linking memory, duty, and legitimacy."
                applyLabel="Add beat"
                rejectLabel="Skip"
                cardVariant="highlight"
                actionsPosition="header"
                visual={
                  <Avatar
                    size="sm"
                    emoji="🌲"
                    backgroundColor="s-bg-blue-100"
                  />
                }
              />
              <ActionCardBlock
                title="Rework Jon’s decision moment"
                description="Hold the blade beat for two exchanges to sell the internal conflict."
                applyLabel="Rework"
                rejectLabel="Leave as is"
                cardVariant="secondary"
                visual={
                  <Avatar
                    size="sm"
                    emoji="⚔️"
                    backgroundColor="s-bg-green-100"
                  />
                }
              />
            </div>
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>

        <NewConversationMessageGroup
          type="agent"
          avatarUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
          name="@agent"
          timestamp="09:24"
          renderName={(name) => <span>{name}</span>}
          completionStatus={
            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              Completed in 41 sec
            </span>
          }
        >
          <NewConversationMessageContainer
            citations={[
              <Citation key="table">
                <CitationIcons>
                  <Icon visual={TableIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>Scene-by-scene pacing map</CitationTitle>
              </Citation>,
              <Citation key="notion">
                <CitationIcons>
                  <Icon visual={NotionLogo} size="sm" />
                </CitationIcons>
                <CitationTitle>Alternate endings draft</CitationTitle>
              </Citation>,
            ]}
          >
            <Markdown content={exampleLong} />
          </NewConversationMessageContainer>
        </NewConversationMessageGroup>
      </NewConversationContainer>
    </div>
  ),
};

const exampleShort = `
Key structure ideas:
- Add a quiet beat with Tyrion and Bran on stories as legitimacy.
- Expand the corridor walk to show the cost of conquest on civilians.
- Let Jon argue the case for mercy before he acts, then cut to silence.
`;

const exampleLong = `
**Ending restructure (proposal)**

Strengthen the turn:
- Scene before the assault: Dany hears about missed provisions and frames it as betrayal.
- Insert a small act of mercy that fails, reinforcing her isolation.

Make the council choice land:
- Tyrion reframes the vote as a choice of memory, not bloodline.
- Sansa, Arya, and Davos each acknowledge one consequence of war.

**Suggested follow-ups**
- Draft a 2–3 beat montage of letters to the realm.
- Add a short exchange between Jon and Grey Worm on justice vs. vengeance.
- Reduce the dragon’s arrival delay so the focus stays on the human stakes.

\`\`\`
Next step checklist
[ ] Pull earlier Bran moments for resonance
[ ] Recut the corridor walk for empathy
[ ] Rework council vote dialogue
\`\`\`
`;
