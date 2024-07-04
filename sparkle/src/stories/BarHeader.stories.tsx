import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ChatBubbleBottomCenterTextIcon } from "@sparkle/icons/solid";

import { BarHeader, Page } from "../index_with_tw_base";

const meta = {
  title: "Modules/BarHeader",
  component: BarHeader,
} satisfies Meta<typeof BarHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicBarHeader: Story = {
  args: {
    title: "Knowledge Base",
  },
};

export const BasicBarHeaderValidate = () => {
  const [isSaving, setIsSaving] = React.useState(false);

  return (
    <div className="s-h-full s-w-full">
      <BarHeader
        title="Knowledge Base"
        rightActions={
          <BarHeader.ButtonBar
            variant="validate"
            isSaving={isSaving}
            onSave={() => {
              setIsSaving(true);
              setTimeout(() => {
                setIsSaving(false);
                alert("Save !");
              }, 2000);
            }}
          />
        }
      />
      <div className="s-mt-16 s-h-full s-w-full s-overflow-y-auto">
        <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
        <div className="s-flex s-flex-col s-gap-y-96">
          <img src="https://source.unsplash.com/random" />
          <img src="https://source.unsplash.com/random" />
          <img src="https://source.unsplash.com/random" />
          <img src="https://source.unsplash.com/random" />
        </div>
      </div>
    </div>
  );
};

export const BasicBarHeaderValidateCustomLabel = () => {
  const [isSaving, setIsSaving] = React.useState(false);

  return (
    <div className="s-h-full s-w-full">
      <BarHeader
        title="Knowledge Base"
        rightActions={
          <BarHeader.ButtonBar
            variant="validate"
            isSaving={isSaving}
            saveLabel="Soupinou"
            onSave={() => {
              setIsSaving(true);
              setTimeout(() => {
                setIsSaving(false);
                alert("Save !");
              }, 2000);
            }}
          />
        }
      />
      <div className="s-mt-16 s-h-full s-w-full s-overflow-y-auto">
        <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
        <div className="s-flex s-flex-col s-gap-y-96">
          <img src="https://source.unsplash.com/random" />
          <img src="https://source.unsplash.com/random" />
          <img src="https://source.unsplash.com/random" />
          <img src="https://source.unsplash.com/random" />
        </div>
      </div>
    </div>
  );
};

export const BasicBarHeaderValidateSaveDisabled = () => (
  <div className="s-mt-16 s-h-full s-w-full">
    <BarHeader
      title="Knowledge Base"
      rightActions={<BarHeader.ButtonBar variant="validate" />}
    />
    <div className="s-flex s-flex-col s-gap-16 s-overflow-auto">
      <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
      <div className="s-flex s-flex-col s-gap-y-96">
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
      </div>
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
      <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
      <div className="s-flex s-flex-col s-gap-y-96">
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
      </div>
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
      <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
      <div className="s-flex s-flex-col s-gap-y-96">
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
      </div>
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
      <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
      <div className="s-flex s-flex-col s-gap-y-96">
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
      </div>
    </div>
  </div>
);
