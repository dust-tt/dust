import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ChatBubbleBottomCenterText } from "@sparkle/icons/solid";

import { Avatar, BarHeader, PageHeader } from "../index_with_tw_base";

const meta = {
  title: "Molecule/BarHeader",
  component: BarHeader,
} satisfies Meta<typeof BarHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicBarHeader: Story = {
  args: {
    title: "Knowledge Base",
  },
};

export const BasicBarHeaderValidate = () => (
  <div className="s-mt-16 s-h-full s-w-full">
    <BarHeader
      title="Knowledge Base"
      rightActions={<BarHeader.ButtonBar variant="validate" />}
    />
    <div className="s-flex s-flex-col s-gap-16 s-overflow-auto">
      <PageHeader title="Page Title" icon={ChatBubbleBottomCenterText} />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
    </div>
  </div>
);

export const BasicBarHeaderBack = () => (
  <div className="s-mt-16 s-h-full s-w-full">
    <BarHeader
      title="Knowledge Base"
      leftActions={<BarHeader.ButtonBar variant="back" />}
    />
    <div className="s-flex s-flex-col s-gap-16 s-overflow-auto">
      <PageHeader title="Page Title" icon={ChatBubbleBottomCenterText} />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
    </div>
  </div>
);

export const BasicBarHeaderClose = () => (
  <div className="s-mt-16 s-h-full s-w-full">
    <BarHeader
      title="Knowledge Base"
      rightActions={<BarHeader.ButtonBar variant="close" />}
    />
    <div className="s-flex s-flex-col s-gap-16 s-overflow-auto">
      <PageHeader title="Page Title" icon={ChatBubbleBottomCenterText} />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
    </div>
  </div>
);

export const BasicBarHeaderConversation = () => (
  <div className="s-mt-16 s-h-full s-w-full">
    <BarHeader
      title="Knowledge Base"
      rightActions={<BarHeader.ButtonBar variant="conversation" />}
    />
    <div className="s-flex s-flex-col s-gap-16 s-overflow-auto">
      <PageHeader title="Page Title" icon={ChatBubbleBottomCenterText} />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
      <Avatar visual="https://source.unsplash.com/random" size="full" />
    </div>
  </div>
);
