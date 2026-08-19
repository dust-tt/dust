import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Avatar,
  Icon,
  ListGroup,
  Type01,
  UniversalSearchItem,
} from "../index_with_tw_base";

const meta = {
  title: "Lists/UniversalSearchItem",
  component: UniversalSearchItem,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `A result row for a universal/global search, pairing a leading **visual** (icon or avatar) with a **title** and optional **description** snippet. Highlights the active result with **selected**, toggles its divider with **hasSeparator**, and opens the result via **onClick**.

**When to use**
- To render heterogeneous search results (documents, conversations, people) in a single global search list.

**Guidelines**
- **title** accepts a React node, so compose multiple spans (e.g. an author plus a snippet) and let long text truncate.
- Drive **selected** from keyboard navigation to show the highlighted result.
- Group rows in **ListGroup**; this component is built on **ListItem**, so reach for that primitive for non-search rows.`,
      },
    },
  },
} satisfies Meta<typeof UniversalSearchItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A document result: icon visual, truncating title, and a description
 * snippet. The row is wrapped in `ListGroup`, which renders the separators.
 *
 * @summary Document result with icon, title, and snippet.
 */
export const DocumentResult: Story = {
  args: {
    visual: <Icon visual={Type01} size="md" />,
    title: <span className="min-w-0 truncate">Q4 Report.pdf</span>,
    description:
      "Summary: Key findings are consolidated in the sections below.",
  },
  render: (args) => (
    <ListGroup>
      <UniversalSearchItem {...args} />
    </ListGroup>
  ),
};

/**
 * A person result marked `selected` (drive this from keyboard navigation).
 * The `title` composes two spans — a fixed author and a truncating snippet.
 *
 * @summary Selected person result with a composed title.
 */
export const SelectedPersonResult: Story = {
  args: {
    visual: (
      <Avatar
        name="Alex Doe"
        visual="https://i.pravatar.cc/150?img=5"
        size="xs"
        isRounded={true}
      />
    ),
    title: (
      <>
        <span className="shrink-0">Alex Doe</span>
        <span className="min-w-0 truncate text-muted-foreground">
          Project kickoff notes
        </span>
      </>
    ),
    description: "We aligned on milestones, deliverables, and owners for Q1.",
    selected: true,
    hasSeparator: false,
  },
  render: (args) => (
    <ListGroup>
      <UniversalSearchItem {...args} />
    </ListGroup>
  ),
};
