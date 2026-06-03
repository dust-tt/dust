import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  BoldIcon,
  Button,
  CodeSquare01V2,
  Code01V2,
  Heading01V2,
  HoveringBar,
  ItalicIcon,
  LinkIcon,
  CheckDone01V2,
  ListOrdered2Icon,
  QuoteTextIcon,
  Stars02V2,
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
        <Button icon={Heading01V2} size="icon" variant="ghost-secondary" />
        <Button icon={BoldIcon} size="icon" variant="ghost-secondary" />
        <Button icon={ItalicIcon} size="icon" variant="ghost-secondary" />
        <HoveringBar.Separator />
        <Button icon={LinkIcon} size="icon" variant="ghost-secondary" />
      </>
    ),
  },
};

export const WithLabel = () => (
  <HoveringBar>
    <Button label="Ask Sidekick" size="sm" variant="ghost" icon={Stars02V2} />
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
      icon={Heading01V2}
      size="icon"
      variant="ghost-secondary"
      tooltip="Heading"
    />
    <Button
      icon={BoldIcon}
      size="icon"
      variant="ghost-secondary"
      tooltip="Bold"
    />
    <Button
      icon={ItalicIcon}
      size="icon"
      variant="ghost-secondary"
      tooltip="Italic"
    />
    <HoveringBar.Separator />
    <Button
      icon={LinkIcon}
      size="icon"
      variant="ghost-secondary"
      tooltip="Link"
    />
    <HoveringBar.Separator />
    <Button
      icon={CheckDone01V2}
      size="icon"
      variant="ghost-secondary"
      tooltip="Bulleted list"
    />
    <Button
      icon={ListOrdered2Icon}
      size="icon"
      variant="ghost-secondary"
      tooltip="Ordered list"
    />
    <Button
      icon={QuoteTextIcon}
      size="icon"
      variant="ghost-secondary"
      tooltip="Blockquote"
    />
    <HoveringBar.Separator />
    <Button
      icon={Code01V2}
      size="icon"
      variant="ghost-secondary"
      tooltip="Inline code"
    />
    <Button
      icon={CodeSquare01V2}
      size="icon"
      variant="ghost-secondary"
      tooltip="Code block"
    />
  </HoveringBar>
);

export const WithOverflow = () => (
  <div style={{ maxWidth: "200px" }}>
    <HoveringBar className="s-w-full">
      <Button icon={Heading01V2} size="icon" variant="ghost-secondary" />
      <Button icon={BoldIcon} size="icon" variant="ghost-secondary" />
      <Button icon={ItalicIcon} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={LinkIcon} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={CheckDone01V2} size="icon" variant="ghost-secondary" />
      <Button icon={ListOrdered2Icon} size="icon" variant="ghost-secondary" />
      <Button icon={QuoteTextIcon} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={Code01V2} size="icon" variant="ghost-secondary" />
      <Button icon={CodeSquare01V2} size="icon" variant="ghost-secondary" />
    </HoveringBar>
  </div>
);
