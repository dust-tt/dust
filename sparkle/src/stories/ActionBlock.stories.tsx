import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  ActionCardBlock,
  Avatar,
  GmailLogo,
  Markdown,
  SlackLogo,
} from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/ActionBlock",
  tags: ["a11y-issues"],
  component: ActionCardBlock,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `An inline, actionable card rendered inside an agent message to propose a change and let the user accept or reject it. Built on **ActionCardBlock**, it tracks a \`state\` (\`active\`, \`disabled\`, \`accepted\`, \`rejected\`) and swaps in \`acceptedTitle\` / \`rejectedTitle\` once resolved, with **cardVariant** (\`highlight\`, \`warning\`, \`secondary\`), a **size** (\`default\` / \`compact\`), and **actionsPosition** (\`header\` / \`footer\`) for the accept/reject buttons.

**When to use**
- To surface an agent suggestion that needs explicit approval (enable a tool, rename an agent, invite editors) directly in the conversation flow.
- When a request needs an "always allow" affordance via \`hasCheck\` / \`checkLabel\`.

**Guidelines**
- Wire \`onClickAccept\` / \`onClickReject\` to advance \`state\`; label buttons with the action (\`applyLabel\` / \`rejectLabel\`) rather than generic "OK".
- Put optional detail behind \`collapsibleContent\` with a \`collapsibleLabel\` instead of crowding the \`description\`; render rich detail with **Markdown**.
- For a non-actionable, display-only tool card in the agent builder, use **ActionCard** instead.`,
      },
    },
  },
} satisfies Meta<typeof ActionCardBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const renameProposal = {
  title: "Update agent name and avatar",
  acceptedTitle: "Agent name and avatar updated",
  rejectedTitle: "Agent name and avatar update rejected",
  applyLabel: "Update",
  rejectLabel: "Reject",
  cardVariant: "highlight",
  actionsPosition: "header",
  visual: <Avatar size="sm" emoji="👋" backgroundColor="bg-blue-100" />,
  description:
    "The current name is too generic. A descriptive name helps users pick the right agent faster.",
  collapsibleContent: (
    <Markdown
      forcedTextSize="sm"
      content={`- Set the agent name to "Concise Researcher"\n- Update the avatar to a clean, blue icon`}
    />
  ),
  collapsibleLabel: "Suggestion details",
} as const;

/**
 * The canonical active proposal: header accept/reject actions, and optional
 * detail tucked behind `collapsibleContent` instead of crowding the
 * description.
 *
 * @summary Active proposal with collapsible details.
 */
export const ProposedChangeWithDetails: Story = {
  args: {
    ...renameProposal,
    state: "active",
    onClickAccept: fn(),
    onClickReject: fn(),
  },
};

/**
 * Use `cardVariant="warning"` for destructive or risky proposals so the
 * card visually signals caution before the user accepts.
 *
 * @summary Warning variant for a destructive proposal.
 */
export const DestructiveProposal: Story = {
  args: {
    title: "Remove Slack tool",
    acceptedTitle: "Slack tool removed",
    rejectedTitle: "Slack tool removal rejected",
    applyLabel: "Remove",
    rejectLabel: "Reject",
    cardVariant: "warning",
    actionsPosition: "header",
    visual: <Avatar size="sm" icon={SlackLogo} backgroundColor="bg-white" />,
    description:
      "Disable the Slack tool to prevent the agent from posting or reading channel messages by default.",
    state: "active",
    onClickAccept: fn(),
    onClickReject: fn(),
  },
};

/**
 * `hasCheck` / `checkLabel` add an "always allow" checkbox for permission
 * requests that the user may want to grant permanently.
 *
 * @summary Permission request with an "always allow" checkbox.
 */
export const WithAlwaysAllowCheck: Story = {
  args: {
    title: "Agent wants to use Gmail",
    acceptedTitle: "Gmail request approved",
    rejectedTitle: "Gmail request denied",
    applyLabel: "Approve",
    rejectLabel: "Decline",
    cardVariant: "highlight",
    hasCheck: true,
    checkLabel: "Always allow",
    visual: <Avatar size="sm" icon={GmailLogo} backgroundColor="bg-white" />,
    description: "Allow the agent to read and send emails on your behalf.",
    state: "active",
    onClickAccept: fn(),
    onClickReject: fn(),
  },
};

/**
 * `state="disabled"` keeps the proposal visible but not actionable, e.g.
 * while a prerequisite step is pending.
 *
 * @summary Disabled proposal awaiting a prerequisite.
 */
export const DisabledState: Story = {
  args: {
    title: "Add Gmail tool",
    acceptedTitle: "Gmail tool added",
    rejectedTitle: "Gmail tool addition rejected",
    applyLabel: "Add",
    rejectLabel: "Reject",
    cardVariant: "highlight",
    visual: <Avatar size="sm" icon={GmailLogo} backgroundColor="bg-white" />,
    description:
      "Enable the Gmail tool so the agent can read and send emails when users ask to draft replies.",
    state: "disabled",
    onClickAccept: fn(),
    onClickReject: fn(),
  },
};

/**
 * Once resolved, the card swaps its title for `acceptedTitle` (or
 * `rejectedTitle`) and hides the action buttons.
 *
 * @summary Resolved card after the user accepted.
 */
export const AcceptedState: Story = {
  args: {
    ...renameProposal,
    state: "accepted",
    onClickAccept: fn(),
    onClickReject: fn(),
  },
};

/**
 * `size="compact"` for dense conversation contexts.
 *
 * @summary Compact size for dense layouts.
 */
export const CompactSize: Story = {
  args: {
    ...renameProposal,
    size: "compact",
    state: "active",
    onClickAccept: fn(),
    onClickReject: fn(),
  },
};

const LifecycleDemo = () => {
  const [state, setState] = React.useState<
    "active" | "disabled" | "accepted" | "rejected"
  >("active");
  return (
    <ActionCardBlock
      {...renameProposal}
      state={state}
      onClickAccept={() => setState("accepted")}
      onClickReject={() => setState("rejected")}
    />
  );
};

/**
 * The full flow wired up: accepting or rejecting advances `state`, which is
 * exactly how product code should drive the card.
 *
 * @summary Interactive accept/reject lifecycle.
 */
export const InteractiveLifecycle: Story = {
  args: {
    ...renameProposal,
    state: "active",
    onClickAccept: fn(),
    onClickReject: fn(),
  },
  render: () => <LifecycleDemo />,
};
