import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  BoldIcon,
  Button,
  ContainerWithTopBar,
  ItalicIcon,
  LinkIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/ContainerWithTopBar",
  component: ContainerWithTopBar,
} satisfies Meta<typeof ContainerWithTopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const MockToolbar = () => (
  <div className="s-flex s-items-center s-gap-1 s-px-3 s-py-2">
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
    <Button
      icon={LinkIcon}
      size="icon"
      variant="ghost-secondary"
      tooltip="Link"
    />
  </div>
);

export const Default: Story = {
  args: {
    topBar: <MockToolbar />,
    children: (
      <div className="s-p-4 s-text-sm s-text-muted-foreground">
        Focus inside the container to see the focus ring.
      </div>
    ),
  },
};

export const WithError: Story = {
  args: {
    topBar: <MockToolbar />,
    error: true,
    children: (
      <div className="s-p-4 s-text-sm s-text-muted-foreground">
        Error state: border turns warning color.
      </div>
    ),
  },
};
