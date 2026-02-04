import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ActionCardBlock,
  Avatar,
  Button,
  DiffBlock,
  EyeIcon,
  GmailLogo,
  Markdown,
  PencilSquareIcon,
  SlackLogo,
} from "../index_with_tw_base";

const meta = {
  title: "Conversation/ActionBlock",
  component: ActionCardBlock,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ActionCardBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

type ActionCardState = "active" | "disabled" | "accepted" | "rejected";

const StatefulActionCard = (
  props: Omit<
    React.ComponentProps<typeof ActionCardBlock>,
    "state" | "onClickAccept" | "onClickReject"
  > & { initialState?: ActionCardState }
) => {
  const [state, setState] = React.useState<ActionCardState>(
    props.initialState ?? "active"
  );
  return (
    <ActionCardBlock
      {...props}
      state={state}
      onClickAccept={() => setState("accepted")}
      onClickReject={() => setState("rejected")}
    />
  );
};

const ExamplesView = () => {
  return (
    <div className="s-flex s-w-full s-min-w-full s-flex-col s-gap-3 s-p-6">
      <StatefulActionCard
        title="Update agent name and avatar"
        acceptedTitle="Agent name and avatar updated"
        rejectedTitle="Agent name and avatar update rejected"
        applyLabel="Update"
        rejectLabel="Reject"
        cardVariant="highlight"
        actionsPosition="header"
        visual={<Avatar size="md" emoji="👋" backgroundColor="s-bg-blue-100" />}
        description="The current name is too generic. A descriptive name helps users pick the right agent faster."
        collapsibleContent={
          <Markdown
            forcedTextSize="sm"
            content={`- Set the agent name to "Concise Researcher"\n- Update the avatar to a clean, blue icon`}
          />
        }
        collapsibleLabel="Suggestion details"
      />
      <StatefulActionCard
        title="Remove Slack tool"
        acceptedTitle="Slack tool removed"
        rejectedTitle="Slack tool removal rejected"
        applyLabel="Remove"
        rejectLabel="Reject"
        cardVariant="warning"
        visual={
          <Avatar size="sm" icon={SlackLogo} backgroundColor="s-bg-white" />
        }
        actionsPosition="header"
        description="Disable the Slack tool to prevent the agent from posting or reading channel messages by default."
      />
      <StatefulActionCard
        title="Add Gmail tool"
        acceptedTitle="Gmail tool added"
        rejectedTitle="Gmail tool addition rejected"
        applyLabel="Add"
        rejectLabel="Reject"
        cardVariant="highlight"
        initialState="disabled"
        visual={
          <Avatar size="sm" icon={GmailLogo} backgroundColor="s-bg-white" />
        }
        description="Enable the Gmail tool so the agent can read and send emails when users ask to draft replies."
      />
      <StatefulActionCard
        title="Invite editors"
        acceptedTitle="Editors invited"
        rejectedTitle="Invite editors rejected"
        visual={
          <Avatar.Stack
            avatars={[
              { name: "Ava Chen", emoji: "👩‍💻", isRounded: true },
              { name: "Noah Patel", emoji: "🧑‍🔧", isRounded: true },
              { name: "Maya Lopez", emoji: "👩‍🎨", isRounded: true },
              { name: "Theo Martin", emoji: "🧑‍💼", isRounded: true },
            ]}
            nbVisibleItems={4}
          />
        }
        applyLabel="Invite"
        rejectLabel="Skip"
        cardVariant="highlight"
        description="Add four editors to collaborate on this agent."
      />
      <StatefulActionCard
        title="Agent wants to use Gmail"
        acceptedTitle="Gmail request approved"
        rejectedTitle="Gmail request denied"
        applyLabel="Approve"
        rejectLabel="Decline"
        cardVariant="highlight"
        hasCheck
        checkLabel="Always allow"
        visual={
          <Avatar size="sm" icon={GmailLogo} backgroundColor="s-bg-white" />
        }
        description="Details about the action"
      />
    </div>
  );
};

export const Examples: Story = {
  args: {
    title: "Action block examples",
  },
  render: () => <ExamplesView />,
};
