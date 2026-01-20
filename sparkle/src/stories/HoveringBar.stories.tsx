import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  BoldIcon,
  Button,
  CodeBlockIcon,
  CodeSlashIcon,
  HeadingIcon,
  HoveringBar,
  ItalicIcon,
  LinkIcon,
  ListCheckIcon,
  ListOrdered2Icon,
  QuoteTextIcon,
  SparklesIcon,
} from "../index_with_tw_base";

const meta = {
  title: "WIP/HoveringBar",
  component: HoveringBar,
} satisfies Meta<typeof HoveringBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <Button icon={HeadingIcon} size="mini" variant="ghost-secondary" />
        <Button icon={BoldIcon} size="mini" variant="ghost-secondary" />
        <Button icon={ItalicIcon} size="mini" variant="ghost-secondary" />
        <HoveringBar.Separator />
        <Button icon={LinkIcon} size="mini" variant="ghost-secondary" />
      </>
    ),
  },
};

export const WithLabel = () => (
  <HoveringBar>
    <Button label="Ask Copilot" size="sm" variant="ghost" icon={SparklesIcon} />
    <HoveringBar.Separator />
    <Button
      icon={BoldIcon}
      size="sm"
      variant="ghost-secondary"
      tooltip="Bold"
    />
  </HoveringBar>
);

export const FullFormattingToolbar = () => (
  <HoveringBar>
    <Button
      icon={HeadingIcon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Heading"
    />
    <Button
      icon={BoldIcon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Bold"
    />
    <Button
      icon={ItalicIcon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Italic"
    />
    <HoveringBar.Separator />
    <Button
      icon={LinkIcon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Link"
    />
    <HoveringBar.Separator />
    <Button
      icon={ListCheckIcon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Bulleted list"
    />
    <Button
      icon={ListOrdered2Icon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Ordered list"
    />
    <Button
      icon={QuoteTextIcon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Blockquote"
    />
    <HoveringBar.Separator />
    <Button
      icon={CodeSlashIcon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Inline code"
    />
    <Button
      icon={CodeBlockIcon}
      size="mini"
      variant="ghost-secondary"
      tooltip="Code block"
    />
  </HoveringBar>
);

export const WithOverflow = () => (
  <div style={{ maxWidth: "200px" }}>
    <HoveringBar className="s-w-full">
      <Button icon={HeadingIcon} size="mini" variant="ghost-secondary" />
      <Button icon={BoldIcon} size="mini" variant="ghost-secondary" />
      <Button icon={ItalicIcon} size="mini" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={LinkIcon} size="mini" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={ListCheckIcon} size="mini" variant="ghost-secondary" />
      <Button icon={ListOrdered2Icon} size="mini" variant="ghost-secondary" />
      <Button icon={QuoteTextIcon} size="mini" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={CodeSlashIcon} size="mini" variant="ghost-secondary" />
      <Button icon={CodeBlockIcon} size="mini" variant="ghost-secondary" />
    </HoveringBar>
  </div>
);
