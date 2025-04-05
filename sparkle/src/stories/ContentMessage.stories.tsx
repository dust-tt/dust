import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ChatBubbleBottomCenterTextIcon,
  ContentMessage,
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

export const WithList: Story = {
  args: {
    title: "Agent Thoughts",
    variant: "slate",
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
