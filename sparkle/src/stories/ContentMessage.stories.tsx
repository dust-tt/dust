import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ChatBubbleBottomCenterTextIcon,
  ContentMessage,
  ContentMessageAction,
  ContentMessageInline,
  HeartIcon,
  InformationCircleIcon,
} from "../index_with_tw_base";

const ICONS = {
  none: null,
  InformationCircleIcon: InformationCircleIcon,
  ChatBubbleBottomCenterTextIcon: ChatBubbleBottomCenterTextIcon,
  HeartIcon: HeartIcon,
} as const;

const meta = {
  title: "Components/ContentMessage",
  component: ContentMessage,
  argTypes: {
    title: {
      control: "text",
      description: "Title of the message",
    },
    children: {
      control: "text",
      description: "Content of the message",
    },
    variant: {
      options: [
        "primary",
        "warning",
        "success",
        "highlight",
        "info",
        "green",
        "blue",
        "rose",
        "golden",
        "outline",
      ],
      control: { type: "select" },
      description: "Visual style variant",
    },
    size: {
      options: ["sm", "md", "lg"],
      control: { type: "select" },
      description: "Size of the message",
    },
    icon: {
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      description: "Icon to display",
    },
  },
} satisfies Meta<typeof ContentMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    title: "This is a title",
    children: "This is a message. It can be multiple lines long.",
    size: "md",
  },
};

export const WithIcon: Story = {
  args: {
    title: "This is a title",
    icon: InformationCircleIcon,
    children: "This is a message. It can be multiple lines long.",
    size: "md",
  },
};

export const WithList: Story = {
  args: {
    title: "Agent Thoughts",
    variant: "primary",
    size: "md",
    children: (
      <ul className="s-list-disc s-py-2 s-pl-8 first:s-pt-0 last:s-pb-0">
        <li className="s-break-words s-py-1 first:s-pt-0 last:s-pb-0">
          <div className="s-whitespace-pre-wrap s-break-words s-py-1 s-font-normal first:s-pt-0 last:s-pb-0">
            Should search internal data as this appears to be a code-related
            question specific to the company"s codebase
          </div>
        </li>
        <li className="s-break-words s-py-1 first:s-pt-0 last:s-pb-0">
          <div className="s-whitespace-pre-wrap s-break-words s-py-1 s-font-normal first:s-pt-0 last:s-pb-0">
            Search results show that Page.SectionHeader expects a string title,
            but code is using JSX expression with concatenation
          </div>
        </li>
      </ul>
    ),
  },
};

export const MultiParagraph: Story = {
  args: {
    title: "This is a title",
    children: (
      <div className="s-flex s-flex-col s-gap-y-3">
        <div>This is a message. It can be multiple lines long.</div>
        <div>
          Another paragraph in the content message with a long line and some{" "}
          <strong>strong text</strong>.
        </div>
      </div>
    ),
    size: "md",
  },
};

export const ColorVariants: Story = {
  render: () => (
    <div className="s-grid s-grid-cols-1 s-gap-4 sm:s-grid-cols-2 lg:s-grid-cols-3">
      {[
        "primary",
        "warning",
        "success",
        "highlight",
        "info",
        "green",
        "blue",
        "rose",
        "golden",
      ].map((variant) => (
        <ContentMessage
          key={variant}
          title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} Variant`}
          variant={
            variant as
              | "primary"
              | "warning"
              | "success"
              | "highlight"
              | "info"
              | "green"
              | "blue"
              | "rose"
              | "golden"
          }
          size="md"
        >
          This is a {variant} variant message. It shows how the component looks
          with this color scheme.
        </ContentMessage>
      ))}
    </div>
  ),
};

export const InlineBasic: Story = {
  render: () => (
    <ContentMessageInline icon={InformationCircleIcon} variant="info">
      This is an inline message. It can be used to display a short message.
    </ContentMessageInline>
  ),
};

export const InlineWithAction: Story = {
  render: () => (
    <ContentMessageInline icon={InformationCircleIcon} variant="info">
      This is an inline message. It can be used to display a short message.
      <ContentMessageAction variant="primary" label="Button" />
    </ContentMessageInline>
  ),
};

export const InlineWithTwoActions: Story = {
  render: () => (
    <ContentMessageInline icon={InformationCircleIcon} variant="info">
      This is an inline message. It can be used to display a short message.
      <ContentMessageAction variant="primary" label="Button" />
      <ContentMessageAction variant="highlight" label="Button" />
    </ContentMessageInline>
  ),
};

export const InlineWithTitle: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <ContentMessageInline
        title="Status"
        icon={InformationCircleIcon}
        variant="info"
      >
        This is an inline message.
        <ContentMessageAction variant="primary" label="Button" />
      </ContentMessageInline>
      <ContentMessageInline
        title="Alert"
        icon={InformationCircleIcon}
        variant="warning"
      />
    </div>
  ),
};

export const InlineVariants: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      {["primary", "warning", "success", "highlight", "info"].map((variant) => (
        <ContentMessageInline
          key={variant}
          icon={InformationCircleIcon}
          variant={
            variant as
              | "primary"
              | "warning"
              | "success"
              | "highlight"
              | "info"
              | "green"
              | "blue"
              | "rose"
              | "golden"
          }
        >
          {variant.charAt(0).toUpperCase() + variant.slice(1)} inline message
          <ContentMessageAction variant="primary" label="Action" />
        </ContentMessageInline>
      ))}
    </div>
  ),
};
