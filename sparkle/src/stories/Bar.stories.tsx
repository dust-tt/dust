import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ChatBubbleBottomCenterTextIcon } from "@sparkle/icons/app";

import {
  Bar,
  BarFooter,
  Button,
  Page,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../index_with_tw_base";

const meta = {
  title: "Modules/Bar",
  component: Bar,
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicBarHeader: Story = {
  args: {
    position: "top",
    title: "Knowledge Base",
  },
};

export const BasicBarFooter: Story = {
  args: {
    position: "bottom",
    rightActions: <span>Right Actions</span>,
  },
};

export const BasicBarHeaderValidate = () => {
  const [isSaving, setIsSaving] = React.useState(false);

  return (
    <div className="s-h-full s-w-full">
      <Bar
        position="top"
        title="Knowledge Base"
        rightActions={
          <Bar.ButtonBar
            variant="validate"
            saveButtonProps={{
              size: "sm",
              label: isSaving ? "Saving..." : "Save",
              variant: "primary",
              onClick: () => {
                setIsSaving(true);
                setTimeout(() => {
                  setIsSaving(false);
                  alert("Save !");
                }, 2000);
              },
              disabled: isSaving,
            }}
          />
        }
      />
      <div className="s-mt-16 s-h-full s-w-full s-overflow-y-auto">
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
    </div>
  );
};

export const BasicBarFooterValidate = () => {
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
        variant="default"
        className="mx-4 s-justify-between"
        leftActions={
          <Button
            variant="outline"
            label="Close"
            onClick={() => console.log("Exit")}
          />
        }
        rightActions={
          <BarFooter.ButtonBar
            variant="validate"
            saveButtonProps={{
              size: "sm",
              label: "Save",
              variant: "primary",
              disabled: false,
            }}
          />
        }
      />
    </div>
  );
};

export const HeaderAndFooterCombined = () => {
  const [isSaving, setIsSaving] = React.useState(false);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col">
      <Bar
        position="top"
        title="Agent Builder"
        rightActions={
          <Bar.ButtonBar variant="close" onClose={() => alert("Closed!")} />
        }
      />
      <div className="s-flex-1 s-overflow-y-auto s-p-4">
        <Page.Header
          title="Page Content"
          icon={ChatBubbleBottomCenterTextIcon}
        />
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
      <Bar
        position="bottom"
        rightActions={
          <Bar.ButtonBar
            variant="validate"
            cancelButtonProps={{
              size: "sm",
              label: "Cancel",
              variant: "ghost",
              onClick: () => alert("Cancelled!"),
            }}
            saveButtonProps={{
              size: "sm",
              label: isSaving ? "Saving..." : "Save",
              variant: "primary",
              onClick: () => {
                setIsSaving(true);
                setTimeout(() => {
                  setIsSaving(false);
                  alert("Saved!");
                }, 2000);
              },
              disabled: isSaving,
            }}
          />
        }
      />
    </div>
  );
};

export const DefaultVariantInPanel = () => {
  const [isSaving, setIsSaving] = React.useState(false);

  return (
    <div className="s-h-full s-w-full">
      <ResizablePanelGroup direction="horizontal" className="s-h-full s-w-full">
        <ResizablePanel defaultSize={70} minSize={30}>
          <div className="s-flex s-h-full s-flex-col s-bg-white s-shadow-sm">
            <Bar
              position="top"
              variant="default"
              title="Agent Builder"
              rightActions={
                <Bar.ButtonBar
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
                This demonstrates the "default" variant of Bar that is contained
                within its parent container, perfect for panels and sidebars.
                This panel uses ResizablePanelGroup like AgentBuilderLayout.
              </p>
            </div>
            <Bar
              position="bottom"
              variant="default"
              rightActions={
                <Bar.ButtonBar
                  variant="validate"
                  cancelButtonProps={{
                    size: "sm",
                    label: "Cancel",
                    variant: "ghost",
                    onClick: () => alert("Cancelled!"),
                  }}
                  saveButtonProps={{
                    size: "sm",
                    label: isSaving ? "Saving..." : "Save",
                    variant: "primary",
                    onClick: () => {
                      setIsSaving(true);
                      setTimeout(() => {
                        setIsSaving(false);
                        alert("Saved!");
                      }, 2000);
                    },
                    disabled: isSaving,
                  }}
                />
              }
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="s-flex s-h-full s-flex-col s-bg-white s-shadow-sm">
            <Bar
              position="top"
              variant="default"
              title="Preview Panel"
              rightActions={
                <Bar.ButtonBar
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
                Notice how each Bar is scoped to its own panel width, unlike the
                "full" variant which would span the entire viewport width. You
                can resize this panel!
              </p>
            </div>
            <Bar
              position="bottom"
              variant="default"
              rightActions={
                <Bar.ButtonBar
                  variant="validate"
                  cancelButtonProps={{
                    size: "sm",
                    label: "Cancel",
                    variant: "ghost",
                    onClick: () => alert("Cancelled!"),
                  }}
                  saveButtonProps={{
                    size: "sm",
                    label: "Save",
                    variant: "primary",
                    onClick: () => alert("Saved!"),
                  }}
                />
              }
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
