import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Bold01,
  Button,
  CodeSquare01,
  Code01,
  Heading01,
  HoveringBar,
  Italic01,
  Link01,
  CheckDone01,
  List,
  DoubleQuotes,
  Stars02,
} from "../index_with_tw_base";

const meta = {
  title: "Lab/HoveringBar",
  component: HoveringBar,
  parameters: {
    docs: {
      description: {
        component: `A compact floating toolbar that groups contextual actions, typically surfaced over a selection or hovered element (e.g. a rich-text formatting bar). Compose it from **Button** children and insert **HoveringBar.Separator** to visually group related actions; the bar handles overflow gracefully when space is tight.

**When to use**
- For inline, contextual action clusters such as text-formatting controls or selection menus.

**Guidelines**
- Use icon **Button**s with the \`ghost-secondary\` variant for a quiet, toolbar-appropriate look, and add \`tooltip\` for icon-only actions.
- Separate logical groups with **HoveringBar.Separator** rather than spacing alone.`,
      },
    },
  },
} satisfies Meta<typeof HoveringBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <Button icon={Heading01} size="icon" variant="ghost-secondary" />
        <Button icon={Bold01} size="icon" variant="ghost-secondary" />
        <Button icon={Italic01} size="icon" variant="ghost-secondary" />
        <HoveringBar.Separator />
        <Button icon={Link01} size="icon" variant="ghost-secondary" />
      </>
    ),
  },
};

export const WithLabel = () => (
  <HoveringBar>
    <Button label="Ask Sidekick" size="sm" variant="ghost" icon={Stars02} />
    <HoveringBar.Separator />
    <Button icon={Bold01} size="sm" variant="ghost-secondary" tooltip="Bold" />
  </HoveringBar>
);

export const FullFormattingToolbar = () => (
  <HoveringBar>
    <Button
      icon={Heading01}
      size="icon"
      variant="ghost-secondary"
      tooltip="Heading"
    />
    <Button
      icon={Bold01}
      size="icon"
      variant="ghost-secondary"
      tooltip="Bold"
    />
    <Button
      icon={Italic01}
      size="icon"
      variant="ghost-secondary"
      tooltip="Italic"
    />
    <HoveringBar.Separator />
    <Button
      icon={Link01}
      size="icon"
      variant="ghost-secondary"
      tooltip="Link"
    />
    <HoveringBar.Separator />
    <Button
      icon={CheckDone01}
      size="icon"
      variant="ghost-secondary"
      tooltip="Bulleted list"
    />
    <Button
      icon={List}
      size="icon"
      variant="ghost-secondary"
      tooltip="Ordered list"
    />
    <Button
      icon={DoubleQuotes}
      size="icon"
      variant="ghost-secondary"
      tooltip="Blockquote"
    />
    <HoveringBar.Separator />
    <Button
      icon={Code01}
      size="icon"
      variant="ghost-secondary"
      tooltip="Inline code"
    />
    <Button
      icon={CodeSquare01}
      size="icon"
      variant="ghost-secondary"
      tooltip="Code block"
    />
  </HoveringBar>
);

export const WithOverflow = () => (
  <div style={{ maxWidth: "200px" }}>
    <HoveringBar className="s-w-full">
      <Button icon={Heading01} size="icon" variant="ghost-secondary" />
      <Button icon={Bold01} size="icon" variant="ghost-secondary" />
      <Button icon={Italic01} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={Link01} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={CheckDone01} size="icon" variant="ghost-secondary" />
      <Button icon={List} size="icon" variant="ghost-secondary" />
      <Button icon={DoubleQuotes} size="icon" variant="ghost-secondary" />
      <HoveringBar.Separator />
      <Button icon={Code01} size="icon" variant="ghost-secondary" />
      <Button icon={CodeSquare01} size="icon" variant="ghost-secondary" />
    </HoveringBar>
  </div>
);
