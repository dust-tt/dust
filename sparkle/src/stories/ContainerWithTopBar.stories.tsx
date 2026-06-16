import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Bold01,
  Button,
  ContainerWithTopBar,
  Italic01,
  Link01,
} from "../index_with_tw_base";

const meta = {
  title: "Layout/ContainerWithTopBar",
  component: ContainerWithTopBar,
  parameters: {
    docs: {
      description: {
        component: `A bordered surface with a sticky **topBar** slot (typically a toolbar) above its **children**, sharing a single focus ring so the bar and body read as one focusable unit.

**When to use**
- For editors or panels that need a persistent action bar above scrollable or editable content.

**Guidelines**
- Put grouped controls (e.g. **Button** icons) in the **topBar**; keep the main work area in children.
- For a plain centered page wrapper without a toolbar, use **Container** instead.`,
      },
    },
  },
} satisfies Meta<typeof ContainerWithTopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const MockToolbar = () => (
  <div className="s-flex s-items-center s-gap-1 s-px-3 s-py-2">
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
    <Button
      icon={Link01}
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
