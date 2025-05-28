import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ChatBubbleBottomCenterTextIcon } from "@sparkle/icons/app";

import {
  BarHeader,
  Page,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../index_with_tw_base";

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
      tooltip="This is a tooltip"
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

export const BasicBarHeaderValidateSaveDisabledWithTooltip = () => (
  <div className="s-mt-16 s-h-full s-w-full">
    <BarHeader
      title="Knowledge Base"
      rightActions={
        <BarHeader.ButtonBar
          variant="validate"
          saveTooltip="Saving agents is temporarily disabled and will be re-enabled shortly"
        />
      }
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

export const DefaultVariantInPanel = () => {
  const [isSaving, setIsSaving] = React.useState(false);

  return (
    <div className="s-h-full s-w-full">
      <ResizablePanelGroup direction="horizontal" className="s-h-full s-w-full">
        <ResizablePanel defaultSize={70} minSize={30}>
          <div className="s-flex s-h-full s-flex-col s-bg-white s-shadow-sm">
            <BarHeader
              variant="default"
              title="Agent Builder"
              rightActions={
                <BarHeader.ButtonBar
                  variant="validate"
                  isSaving={isSaving}
                  onCancel={() => alert("Cancelled!")}
                  onSave={() => {
                    setIsSaving(true);
                    setTimeout(() => {
                      setIsSaving(false);
                      alert("Saved!");
                    }, 2000);
                  }}
                />
              }
            />
            <div className="s-flex-1 s-overflow-y-auto s-p-4">
              <Page.Header
                title="Left Panel Content"
                icon={ChatBubbleBottomCenterTextIcon}
              />
              <p className="s-text-sm s-text-gray-600">
                This demonstrates the "default" variant of BarHeader that is
                contained within its parent container, perfect for panels and
                sidebars. This panel uses ResizablePanelGroup like
                AgentBuilderLayout.
              </p>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="s-flex s-h-full s-flex-col s-bg-white s-shadow-sm">
            <BarHeader
              variant="default"
              title="Preview Panel"
              rightActions={
                <BarHeader.ButtonBar
                  variant="close"
                  onClose={() => alert("Closed!")}
                />
              }
            />
            <div className="s-flex-1 s-overflow-y-auto s-p-4">
              <Page.Header
                title="Right Panel Content"
                icon={ChatBubbleBottomCenterTextIcon}
              />
              <p className="s-text-sm s-text-gray-600">
                Notice how each BarHeader is scoped to its own panel width,
                unlike the "full" variant which would span the entire viewport
                width. You can resize this panel!
              </p>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
