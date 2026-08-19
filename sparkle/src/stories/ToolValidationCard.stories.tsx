import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { GithubLogo, ToolValidationCard } from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/ToolValidationCard",
  component: ToolValidationCard,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Asks a user to approve or decline a blocked tool action. Product code supplies the action copy, optional details, persistence scope, and validation handler.",
      },
    },
  },
  args: {
    title: "Allow Research assistant to use GitHub?",
    description: "Create an issue",
    icon: GithubLogo,
    canRespond: true,
    isValidating: false,
    isPulsing: false,
    canAlwaysAllow: true,
    alwaysAllowTooltip: "Always allow this agent to create GitHub issues",
    approveLabel: "Allow",
    onValidate: async () => true,
  },
} satisfies Meta<typeof ToolValidationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDetails: Story = {
  args: {
    details: (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-foreground">
        <dt className="text-muted-foreground">Repository</dt>
        <dd>dust-tt/dust</dd>
        <dt className="text-muted-foreground">Title</dt>
        <dd>Add reusable blocked action cards</dd>
      </dl>
    ),
  },
};

export const ApprovalQueue: Story = {
  args: {
    approvalProgress: {
      current: 2,
      total: 4,
    },
  },
};

export const WaitingForAnotherUser: Story = {
  args: {
    canRespond: false,
    triggeringUserName: "Alex Smith",
    canAlwaysAllow: false,
  },
};
