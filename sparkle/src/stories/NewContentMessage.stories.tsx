import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  NewContentMessage,
  NewContentMessageAction,
  Heart,
  InfoCircle,
  MessageCircle01,
} from "../index_with_tw_base";

type NewContentMessageStoryProps = React.ComponentProps<
  typeof NewContentMessage
> & {
  showAction?: boolean;
};

const ICONS = {
  none: null,
  InfoCircle: InfoCircle,
  MessageCircle01: MessageCircle01,
  Heart: Heart,
} as const;

const meta: Meta<NewContentMessageStoryProps> = {
  title: "Feedback & Status/NewContentMessage",
  component: NewContentMessage,
  parameters: {
    docs: {
      description: {
        component: `A redesigned content message component with semantic color variants and two sizes. Displays contextual information, warnings, or status — with an optional icon, title, body text, and action button.

**Variants:** \`error\`, \`success\`, \`info\`, \`warning\`, \`gray\`

**Sizes:** \`sm\` (default), \`xs\`

**Layout:** When a \`title\` is provided the icon and title appear on the same row, with body text stacked below. Without a title the icon and text appear inline.`,
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
type Story = StoryObj<NewContentMessageStoryProps>;

export const Basic: Story = {
  render: ({ showAction, ...args }) => (
    <NewContentMessage
      {...args}
      action={
        showAction ? (
          <NewContentMessageAction variant="primary" label="Action" />
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
      <NewContentMessage icon={InfoCircle} variant="info" size="sm">
        You can ask the assistant to perform actions before answering, like
        searching in your data sources.
      </NewContentMessage>
      <NewContentMessage icon={InfoCircle} variant="info" size="xs">
        You can ask the assistant to perform actions before answering, like
        searching in your data sources.
      </NewContentMessage>
    </div>
  ),
};

export const WithAction: Story = {
  render: () => (
    <NewContentMessage
      title="This is a title"
      icon={InfoCircle}
      variant="info"
      size="sm"
      action={<NewContentMessageAction variant="primary" label="Learn more" />}
    >
      You can ask the assistant to perform actions before answering, like
      searching in your data sources.
    </NewContentMessage>
  ),
};

export const SizeComparison: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <NewContentMessage
        title="Small (sm)"
        icon={InfoCircle}
        variant="info"
        size="sm"
      >
        You can ask the assistant to perform actions before answering, like
        searching in your data sources, or use a custom action you have built
        for your specific needs.
      </NewContentMessage>
      <NewContentMessage
        title="Extra Small (xs)"
        icon={InfoCircle}
        variant="info"
        size="xs"
      >
        You can ask the assistant to perform actions before answering, like
        searching in your data sources, or use a custom action you have built
        for your specific needs.
      </NewContentMessage>
    </div>
  ),
};

export const ColorVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["error", "success", "info", "warning", "gray"] as const).map(
        (variant) => (
          <NewContentMessage
            key={variant}
            title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} variant`}
            icon={InfoCircle}
            variant={variant}
            size="sm"
          >
            You can ask the assistant to perform actions before answering, like
            searching in your data sources, or use a custom action you have
            built for your specific needs.
          </NewContentMessage>
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
          <NewContentMessage
            key={variant}
            title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} variant`}
            icon={InfoCircle}
            variant={variant}
            size="xs"
          >
            You can ask the assistant to perform actions before answering, like
            searching in your data sources, or use a custom action you have
            built for your specific needs.
          </NewContentMessage>
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
          <NewContentMessage
            key={variant}
            icon={InfoCircle}
            variant={variant}
            size="sm"
          >
            {`${variant.charAt(0).toUpperCase() + variant.slice(1)}: You can ask the assistant to perform actions before answering.`}
          </NewContentMessage>
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
          <NewContentMessage
            key={variant}
            title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} with action`}
            icon={InfoCircle}
            variant={variant}
            size="sm"
            action={
              <NewContentMessageAction variant="primary" label="Learn more" />
            }
          >
            You can ask the assistant to perform actions before answering, like
            searching in your data sources.
          </NewContentMessage>
        )
      )}
    </div>
  ),
};
