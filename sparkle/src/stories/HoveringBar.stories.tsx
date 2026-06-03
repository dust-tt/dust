import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Bold01V2,
  Button,
  CodeSquare01V2,
  Code01V2,
  Heading01V2,
  HoveringBar,
  Italic01V2,
  Link01V2,
  CheckDone01V2,
  ListOrdered2Icon,
  DoubleQuotesV2,
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
        <Button icon={Bold01V2} size="icon" variant="ghost-secondary" />
        <Button icon={Italic01V2} size="icon" variant="ghost-secondary" />
        <HoveringBar.Separator />
        <Button icon={Link01V2} size="icon" variant="ghost-secondary" />
      </>
    ),
  },
};

export const WithLabel = () => (
  <HoveringBar>
    <Button label="Ask Sidekick" size="sm" variant="ghost" icon={Stars02V2} />
    <HoveringBar.Separator />
    <Button
      icon={Bold01V2}
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
      icon={Bold01V2}
      size="icon"
      variant="ghost-secondary"
      tooltip="Bold"
    />
    <Button
      icon={Italic01V2}
      size="icon"
      variant="ghost-secondary"
      tooltip="Italic"
    />
    <HoveringBar.Separator />
    <Button
      icon={Link01V2}
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
      icon={DoubleQuotesV2}
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
      <Button icon={Bold01V2} size="icon" variant="ghost-secondary" />
      <Button icon={Italic01V2} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={Link01V2} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={CheckDone01V2} size="icon" variant="ghost-secondary" />
      <Button icon={ListOrdered2Icon} size="icon" variant="ghost-secondary" />
      <Button icon={DoubleQuotesV2} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={Code01V2} size="icon" variant="ghost-secondary" />
      <Button icon={CodeSquare01V2} size="icon" variant="ghost-secondary" />
    </HoveringBar>
  </div>
);
