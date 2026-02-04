import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { RequestCard } from "@sparkle/components/RequestCard";
import { ChatBubbleLeftRightIcon, CommandLineIcon } from "@sparkle/icons/app";
import { GmailLogo } from "@sparkle/logo/platforms";

const meta: Meta<typeof RequestCard> = {
  title: "Conversation/RequestCard",
  component: RequestCard,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A card component for displaying confirmation requests in conversations, such as inviting users or approving tool execution.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const InviteUser: Story = {
  args: {
    icon: ChatBubbleLeftRightIcon,
    title: "Invite Edouard Wautier to Design?",
    description:
      "They'll gain access to confidential project data, see the full history, and reply.",
    primaryAction: {
      label: "Invite",
      onClick: () => alert("Invite clicked"),
    },
    secondaryAction: {
      label: "Cancel",
      onClick: () => alert("Cancel clicked"),
    },
  },
};

export const ToolExecution: Story = {
  render: () => {
    const [alwaysAllow, setAlwaysAllow] = React.useState(false);

    return (
      <RequestCard
        visual={<GmailLogo className="s-h-full s-w-full" />}
        title='Execute "Create Draft" from Gmail'
        details={{
          trigger: "Details",
          content: (
            <pre className="s-font-mono s-text-xs">
              {JSON.stringify(
                {
                  to: "user@example.com",
                  subject: "Hello from Dust",
                  body: "This is a draft email.",
                },
                null,
                2
              )}
            </pre>
          ),
        }}
        checkbox={{
          label: "Always allow for",
          checked: alwaysAllow,
          onChange: setAlwaysAllow,
          avatar: {
            name: "Edouard",
            visual: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
          },
        }}
        primaryAction={{
          label: "Allow",
          onClick: () => alert("Allow clicked"),
        }}
        secondaryAction={{
          label: "Decline",
          onClick: () => alert("Decline clicked"),
        }}
      />
    );
  },
};

export const WithDescription: Story = {
  args: {
    icon: CommandLineIcon,
    title: "Run database migration?",
    description: (
      <>
        This will execute the migration on{" "}
        <strong>production-db-us-east</strong>. Make sure you have reviewed the
        changes.
      </>
    ),
    primaryAction: {
      label: "Run",
      onClick: () => alert("Run clicked"),
    },
    secondaryAction: {
      label: "Cancel",
      onClick: () => alert("Cancel clicked"),
    },
  },
};

export const LoadingState: Story = {
  args: {
    icon: CommandLineIcon,
    title: "Execute command?",
    primaryAction: {
      label: "Execute",
      onClick: () => {},
      isLoading: true,
    },
    secondaryAction: {
      label: "Cancel",
      onClick: () => {},
      disabled: true,
    },
  },
};

export const WarningVariant: Story = {
  args: {
    icon: CommandLineIcon,
    title: "Delete 5 files?",
    description: "This action cannot be undone.",
    primaryAction: {
      label: "Delete",
      variant: "warning",
      onClick: () => alert("Delete clicked"),
    },
    secondaryAction: {
      label: "Cancel",
      onClick: () => alert("Cancel clicked"),
    },
  },
};
