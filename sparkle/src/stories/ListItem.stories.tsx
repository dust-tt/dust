import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import { ListGroup, ListItem, ListItemSection } from "../index_with_tw_base";

const meta = {
  title: "Lists/ListItem",
  component: ListItem,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A low-level, generic list row that wraps arbitrary children with consistent padding, an optional bottom **separator**, and a hover background when **onClick** is provided. Control vertical alignment with **itemsAlignment** (\`start\` / \`center\`), the divider with **hasSeparator** / **hasSeparatorIfLast**, and hover scoping with **groupName**.

**When to use**
- As the base building block for custom list rows, or to render simple clickable rows without bespoke styling.

**Guidelines**
- Wrap rows in **ListGroup** and use **ListItemSection** for group headers (e.g. \`Today\`, \`Yesterday\`).
- Set \`hasSeparator={false}\` on the last row, or use **hasSeparatorIfLast**, to avoid a trailing divider.
- For richer purpose-built rows prefer **ContextItem**, **ConversationListItem**, or **UniversalSearchItem**, which are built on top of this primitive.`,
      },
    },
  },
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

/**
 * Passing **onClick** makes a row interactive: it gains a hover background and
 * pointer cursor. The last row sets `hasSeparator={false}` so the list does not
 * end with a trailing divider.
 * @summary Clickable rows with hover feedback.
 */
export const WithOnClick: Story = {
  args: { children: null, onClick: fn() },
  render: (args) => (
    <div className="flex flex-col">
      <ListItem onClick={args.onClick}>
        <div className="text-foreground">Weekly product sync notes</div>
      </ListItem>
      <ListItem onClick={args.onClick}>
        <div className="text-foreground">Q3 roadmap draft</div>
      </ListItem>
      <ListItem onClick={args.onClick} hasSeparator={false}>
        <div className="text-foreground">Customer feedback summary</div>
      </ListItem>
    </div>
  ),
};

/**
 * Rows composed with **ListGroup** and **ListItemSection** headers — the
 * pattern for date-bucketed lists such as a conversation history. Sections
 * label the buckets; the group scopes hover states and separators.
 * @summary Sectioned list with group headers.
 */
export const WithGroupAndSection: Story = {
  args: { children: null, onClick: fn() },
  render: (args) => (
    <ListGroup>
      <ListItemSection>Today</ListItemSection>
      <ListItem onClick={args.onClick}>
        <div className="text-foreground">Draft launch announcement</div>
      </ListItem>
      <ListItem onClick={args.onClick}>
        <div className="text-foreground">Summarize support tickets</div>
      </ListItem>
      <ListItemSection>Yesterday</ListItemSection>
      <ListItem onClick={args.onClick}>
        <div className="text-foreground">Compare pricing pages</div>
      </ListItem>
      <ListItem onClick={args.onClick}>
        <div className="text-foreground">Translate onboarding email</div>
      </ListItem>
    </ListGroup>
  ),
};
