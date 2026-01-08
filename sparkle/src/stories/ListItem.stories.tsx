import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ListGroup, ListItem, ListItemSection } from "../index_with_tw_base";

const meta = {
  title: "Primitives/ListItem",
  component: ListItem,
  tags: ["autodocs"],
  argTypes: {
    hasSeparator: {
      control: "boolean",
      description: "Whether to show a separator border at the bottom",
    },
    hasSeparatorIfLast: {
      control: "boolean",
      description: "Whether to show separator on the last item",
    },
    groupName: {
      control: "text",
      description: "Group name for hover states (used in group-hover classes)",
    },
    itemsAlignment: {
      control: "select",
      options: ["start", "center"],
      description: "Vertical alignment of items",
    },
    onClick: {
      action: "clicked",
      description: "Click handler function",
    },
  },
} satisfies Meta<typeof ListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithOnClick: Story = {
  args: { children: null },
  render: () => (
    <div className="s-flex s-flex-col">
      <ListItem onClick={() => console.log("Item 1 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 1 - hover to see background change
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Item 2 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 2 - another clickable item
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Item 3 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 3 - hover to see background change
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Item 4 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 4 - another clickable item
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Item 5 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 5 - hover to see background change
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Item 6 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 6 - another clickable item
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Item 7 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 7 - hover to see background change
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Item 8 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 8 - another clickable item
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Item 9 clicked")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 9 - hover to see background change
        </div>
      </ListItem>
      <ListItem
        onClick={() => console.log("Item 10 clicked")}
        hasSeparator={false}
      >
        <div className="s-text-foreground dark:s-text-foreground-night">
          Clickable item 10 - last item without separator
        </div>
      </ListItem>
    </div>
  ),
};

export const WithGroupAndSection: Story = {
  args: { children: null },
  render: () => (
    <ListGroup>
      <ListItemSection>Today</ListItemSection>
      <ListItem onClick={() => console.log("Today item 1")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Today - Item 1
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Today item 2")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Today - Item 2
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Today item 3")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Today - Item 3
        </div>
      </ListItem>
      <ListItemSection>Yesterday</ListItemSection>
      <ListItem onClick={() => console.log("Yesterday item 1")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Yesterday - Item 1
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Yesterday item 2")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Yesterday - Item 2
        </div>
      </ListItem>
      <ListItemSection>Last Week</ListItemSection>
      <ListItem onClick={() => console.log("Last week item 1")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Last Week - Item 1
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Last week item 2")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Last Week - Item 2
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Last week item 3")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Last Week - Item 3
        </div>
      </ListItem>
      <ListItem onClick={() => console.log("Last week item 4")}>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Last Week - Item 4
        </div>
      </ListItem>
    </ListGroup>
  ),
};
