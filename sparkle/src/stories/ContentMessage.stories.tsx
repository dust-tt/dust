import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ContentMessage,
  ContentMessageAction,
  Heart,
  InfoCircle,
  MessageCircle01,
} from "../index_with_tw_base";

type ContentMessageStoryProps = React.ComponentProps<typeof ContentMessage> & {
  showAction?: boolean;
};

const ICONS = {
  none: null,
  InfoCircle: InfoCircle,
  MessageCircle01: MessageCircle01,
  Heart: Heart,
} as const;

const meta: Meta<ContentMessageStoryProps> = {
  title: "Feedback & Status/ContentMessage",
  component: ContentMessage,
  parameters: {
    docs: {
      description: {
        component: `An inline, non-blocking message that communicates contextual information, feedback, or status without interrupting the user — an informational note, a warning, or a success confirmation. Available in multiple **variants** and **sizes**, with an optional **icon** and action.

**When to use**
- To show persistent, contextual information attached to a region of the page.
- To explain a state ("This agent is read-only") or surface a non-urgent warning.

**Guidelines**
- Match the **variant** to the intent — \`error\`, \`warning\`, \`success\`, \`info\`, \`gray\`.
- For transient feedback after an action, use a **Notification** (toast) instead.
- For a decision that must block the flow, use a **Dialog**.`,
      },
    },
  },
  argTypes: {
    title: {
      control: "text",
      description: "Title of the message",
    },
    children: {
      control: "text",
      description: "Body content of the message",
    },
    variant: {
      options: ["error", "success", "info", "warning", "gray"],
      control: { type: "select" },
      description: "Color variant",
    },
    size: {
      options: ["sm", "xs"],
      control: { type: "select" },
      description: "Size of the message",
    },
    icon: {
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      description: "Icon to display",
    },
    showAction: {
      control: "boolean",
      description: "Show a bottom action button",
    },
  },
};

export default meta;
type Story = StoryObj<ContentMessageStoryProps>;

export const Basic: Story = {
  render: ({ showAction, ...args }) => (
    <ContentMessage
      {...args}
      action={
        showAction ? (
          <ContentMessageAction variant="primary" label="Action" />
        ) : undefined
      }
    />
  ),
  args: {
    title: "This is a title",
    children: "You can ask the assistant to perform actions before answering.",
    size: "sm",
    variant: "info",
    showAction: false,
  },
};

export const WithIcon: Story = {
  args: {
    title: "This is a title",
    icon: InfoCircle,
    children: "You can ask the assistant to perform actions before answering.",
    size: "sm",
    variant: "info",
  },
};

export const NoTitle: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ContentMessage icon={InfoCircle} variant="info" size="sm">
        You can ask the assistant to perform actions before answering, like
        searching in your data sources.
      </ContentMessage>
      <ContentMessage icon={InfoCircle} variant="info" size="xs">
        You can ask the assistant to perform actions before answering, like
        searching in your data sources.
      </ContentMessage>
    </div>
  ),
};

export const WithAction: Story = {
  render: () => (
    <ContentMessage
      title="This is a title"
      icon={InfoCircle}
      variant="info"
      size="sm"
      action={<ContentMessageAction variant="primary" label="Learn more" />}
    >
      You can ask the assistant to perform actions before answering, like
      searching in your data sources.
    </ContentMessage>
  ),
};

export const SizeComparison: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ContentMessage title="Small (sm)" icon={InfoCircle} variant="info" size="sm">
        You can ask the assistant to perform actions before answering, like
        searching in your data sources, or use a custom action you have built
        for your specific needs.
      </ContentMessage>
      <ContentMessage title="Extra Small (xs)" icon={InfoCircle} variant="info" size="xs">
        You can ask the assistant to perform actions before answering, like
        searching in your data sources, or use a custom action you have built
        for your specific needs.
      </ContentMessage>
    </div>
  ),
};

export const ColorVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["error", "success", "info", "warning", "gray"] as const).map(
        (variant) => (
          <ContentMessage
            key={variant}
            title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} variant`}
            icon={InfoCircle}
            variant={variant}
            size="sm"
          >
            You can ask the assistant to perform actions before answering, like
            searching in your data sources, or use a custom action you have
            built for your specific needs.
          </ContentMessage>
        )
      )}
    </div>
  ),
};

export const ColorVariantsXs: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["error", "success", "info", "warning", "gray"] as const).map(
        (variant) => (
          <ContentMessage
            key={variant}
            title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} variant`}
            icon={InfoCircle}
            variant={variant}
            size="xs"
          >
            You can ask the assistant to perform actions before answering, like
            searching in your data sources, or use a custom action you have
            built for your specific needs.
          </ContentMessage>
        )
      )}
    </div>
  ),
};

export const NoTitleColorVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["error", "success", "info", "warning", "gray"] as const).map(
        (variant) => (
          <ContentMessage key={variant} icon={InfoCircle} variant={variant} size="sm">
            {`${variant.charAt(0).toUpperCase() + variant.slice(1)}: You can ask the assistant to perform actions before answering.`}
          </ContentMessage>
        )
      )}
    </div>
  ),
};

export const WithBottomAction: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["error", "success", "info", "warning", "gray"] as const).map(
        (variant) => (
          <ContentMessage
            key={variant}
            title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} with action`}
            icon={InfoCircle}
            variant={variant}
            size="sm"
            action={<ContentMessageAction variant="primary" label="Learn more" />}
          >
            You can ask the assistant to perform actions before answering, like
            searching in your data sources.
          </ContentMessage>
        )
      )}
    </div>
  ),
};
