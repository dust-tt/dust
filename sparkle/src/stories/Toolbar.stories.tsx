import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import type { ToolbarProps } from "../index_with_tw_base";
import {
  Bold01,
  CodeSquare01,
  Code01,
  Heading01,
  Italic01,
  CheckDone01,
  List,
  DoubleQuotes,
  Toolbar,
  ToolbarContent,
  ToolbarIcon,
  ToolbarLink,
} from "../index_with_tw_base";

const TOOLBAR_VARIANTS = ["inline", "overlay"] as const;

interface ToolbarPreviewProps
  extends Pick<ToolbarProps, "variant" | "scroll" | "onClose"> {}

function ToolbarPreview({ variant, scroll, onClose }: ToolbarPreviewProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState("Dust");
  const [linkUrl, setLinkUrl] = useState("dust.tt");
  const isOverlay = variant === "overlay";
  const buttonSize = isOverlay ? "xs" : "sm";

  function handleToolbarAction(): void {}

  function handleLinkDialogOpen(): void {
    setIsLinkDialogOpen(true);
  }

  function handleLinkDialogOpenChange(open: boolean): void {
    setIsLinkDialogOpen(open);
  }

  function handleLinkSubmit(): void {
    setIsLinkDialogOpen(false);
  }

  function handleLinkTextChange(value: string): void {
    setLinkText(value);
  }

  function handleLinkUrlChange(value: string): void {
    setLinkUrl(value);
  }

  const groups = [
    {
      id: "text",
      items: [
        <ToolbarIcon
          key="heading"
          icon={Heading01}
          onClick={handleToolbarAction}
          active
          tooltip="Heading"
          size={buttonSize}
        />,
        <ToolbarIcon
          key="bold"
          icon={Bold01}
          onClick={handleToolbarAction}
          active
          tooltip="Bold"
          size={buttonSize}
        />,
        <ToolbarIcon
          key="italic"
          icon={Italic01}
          onClick={handleToolbarAction}
          tooltip="Italic"
          size={buttonSize}
        />,
      ],
    },
    {
      id: "link",
      items: [
        <ToolbarLink
          key="link"
          isOpen={isLinkDialogOpen}
          onOpenChange={handleLinkDialogOpenChange}
          onOpenDialog={handleLinkDialogOpen}
          onSubmit={handleLinkSubmit}
          linkText={linkText}
          linkUrl={linkUrl}
          onLinkTextChange={handleLinkTextChange}
          onLinkUrlChange={handleLinkUrlChange}
          active={isLinkDialogOpen}
          tooltip="Link"
          size={buttonSize}
        />,
      ],
    },
    {
      id: "lists",
      items: [
        <ToolbarIcon
          key="bulleted-list"
          icon={CheckDone01}
          onClick={handleToolbarAction}
          tooltip="Bulleted list"
          size={buttonSize}
        />,
        <ToolbarIcon
          key="ordered-list"
          icon={List}
          onClick={handleToolbarAction}
          tooltip="Ordered list"
          size={buttonSize}
        />,
        <ToolbarIcon
          key="blockquote"
          icon={DoubleQuotes}
          onClick={handleToolbarAction}
          tooltip="Blockquote"
          size={buttonSize}
        />,
      ],
    },
    {
      id: "code",
      items: [
        <ToolbarIcon
          key="inline-code"
          icon={Code01}
          onClick={handleToolbarAction}
          tooltip="Inline code"
          size={buttonSize}
        />,
        <ToolbarIcon
          key="code-block"
          icon={CodeSquare01}
          onClick={handleToolbarAction}
          tooltip="Code block"
          size={buttonSize}
        />,
      ],
    },
  ];

  const toolbar = (
    <Toolbar variant={variant} scroll={scroll} onClose={onClose}>
      <ToolbarContent groups={groups} />
    </Toolbar>
  );

  if (isOverlay) {
    return (
      <div className="s-relative s-h-14 s-w-full s-max-w-[520px] s-rounded-xl s-border s-border-border/70 s-bg-background s-p-2 dark:s-border-border-night/50 dark:s-bg-background-night">
        {toolbar}
      </div>
    );
  }

  return toolbar;
}

function renderToolbarStory({ variant, scroll, onClose }: ToolbarProps) {
  return <ToolbarPreview variant={variant} scroll={scroll} onClose={onClose} />;
}

function handleOverlayClose(
  _event: React.MouseEvent<HTMLButtonElement>
): void {}

const meta = {
  title: "Components/Toolbar",
  component: Toolbar,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      options: TOOLBAR_VARIANTS,
      control: { type: "select" },
    },
    scroll: {
      control: { type: "boolean" },
    },
  },
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    children: null,
    variant: "inline",
    scroll: false,
  },
  render: renderToolbarStory,
};

export const Overlay: Story = {
  args: {
    children: null,
    variant: "overlay",
    scroll: true,
    onClose: handleOverlayClose,
  },
  render: renderToolbarStory,
};
