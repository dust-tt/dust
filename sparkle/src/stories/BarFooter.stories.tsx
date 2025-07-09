import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ChatBubbleBottomCenterTextIcon } from "@sparkle/icons/app";

import {
  BarFooter,
  BarHeader,
  Page,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../index_with_tw_base";

const meta = {
  title: "Modules/BarFooter",
  component: BarFooter,
} satisfies Meta<typeof BarFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicBarFooter: Story = {
  args: {
    rightActions: <span>Right Actions</span>,
  },
};

export const BasicBarFooterValidate = () => {
  const [isSaving, setIsSaving] = React.useState(false);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col">
      <div className="s-flex-1 s-overflow-y-auto s-p-4">
        <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
        <div className="s-flex s-flex-col s-gap-y-96">
          <img
            src="/static/landing/mainVisual/MainVisual1.png"
            alt="Main Visual 1"
          />
          <img
            src="/static/landing/mainVisual/MainVisual2.png"
            alt="Main Visual 2"
          />
          <img
            src="/static/landing/mainVisual/MainVisual3.png"
            alt="Main Visual 3"
          />
          <img
            src="/static/landing/mainVisual/MainVisual4.png"
            alt="Main Visual 4"
          />
        </div>
      </div>
      <BarFooter
        variant="full"
        rightActions={
          <BarFooter.ButtonBar
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
    </div>
  );
};

export const BasicBarFooterValidateCustomLabel = () => {
  const [isSaving, setIsSaving] = React.useState(false);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col">
      <div className="s-flex-1 s-overflow-y-auto s-p-4">
        <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
        <div className="s-flex s-flex-col s-gap-y-96">
          <img
            src="/static/landing/mainVisual/MainVisual1.png"
            alt="Main Visual 1"
          />
          <img
            src="/static/landing/mainVisual/MainVisual2.png"
            alt="Main Visual 2"
          />
          <img
            src="/static/landing/mainVisual/MainVisual3.png"
            alt="Main Visual 3"
          />
          <img
            src="/static/landing/mainVisual/MainVisual4.png"
            alt="Main Visual 4"
          />
        </div>
      </div>
      <BarFooter
        rightActions={
          <BarFooter.ButtonBar
            variant="validate"
            isSaving={isSaving}
            saveLabel="Soupinou"
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
    </div>
  );
};

export const BasicBarFooterValidateSaveDisabled = () => (
  <div className="s-flex s-h-full s-w-full s-flex-col">
    <div className="s-flex-1 s-overflow-y-auto s-p-4">
      <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
      <div className="s-flex s-flex-col s-gap-y-96">
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
      </div>
    </div>
    <BarFooter rightActions={<BarFooter.ButtonBar variant="validate" />} />
  </div>
);

export const BasicBarFooterValidateSaveDisabledWithTooltip = () => (
  <div className="s-flex s-h-full s-w-full s-flex-col">
    <div className="s-flex-1 s-overflow-y-auto s-p-4">
      <Page.Header title="Page Title" icon={ChatBubbleBottomCenterTextIcon} />
      <div className="s-flex s-flex-col s-gap-y-96">
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
        <img src="https://source.unsplash.com/random" />
      </div>
    </div>
    <BarFooter
      rightActions={
        <BarFooter.ButtonBar
          variant="validate"
          saveTooltip="Saving agents is temporarily disabled and will be re-enabled shortly"
        />
      }
    />
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
                  variant="close"
                  onClose={() => alert("Closed!")}
                />
              }
            />
            <div className="s-flex-1 s-overflow-y-auto s-p-4">
              <Page.Header
                title="Left Panel Content"
                icon={ChatBubbleBottomCenterTextIcon}
              />
              <p className="s-text-sm s-text-gray-600">
                This demonstrates the "default" variant of BarFooter that is
                contained within its parent container, perfect for panels and
                sidebars. This panel uses ResizablePanelGroup like
                AgentBuilderLayout.
              </p>
            </div>
            <BarFooter
              variant="default"
              rightActions={
                <BarFooter.ButtonBar
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
                Notice how each BarFooter is scoped to its own panel width,
                unlike the "full" variant which would span the entire viewport
                width. You can resize this panel!
              </p>
            </div>
            <BarFooter
              variant="default"
              rightActions={
                <BarFooter.ButtonBar
                  variant="validate"
                  onCancel={() => alert("Cancelled!")}
                  onSave={() => alert("Saved!")}
                />
              }
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
