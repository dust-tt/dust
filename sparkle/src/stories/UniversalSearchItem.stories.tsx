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

export const DocumentAndConversation: Story = {
  args: {
    title: "Placeholder",
  },
  render: () => (
    <ListGroup>
      <UniversalSearchItem
        visual={<Icon visual={Type01} size="md" />}
        title={<span className="s-min-w-0 s-truncate">Q4 Report.pdf</span>}
        description="Summary: Key findings are consolidated in the sections below."
      />
      <UniversalSearchItem
        visual={
          <Avatar
            name="Alex Doe"
            visual="https://i.pravatar.cc/150?img=5"
            size="xs"
            isRounded={true}
          />
        }
        title={
          <>
            <span className="s-shrink-0">Alex Doe</span>
            <span className="s-min-w-0 s-truncate s-text-muted-foreground dark:s-text-muted-foreground-night">
              Project kickoff notes
            </span>
          </>
        }
        description="We aligned on milestones, deliverables, and owners for Q1."
        selected={true}
        hasSeparator={false}
      />
    </ListGroup>
  ),
};
