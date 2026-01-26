import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Avatar,
  Icon,
  ListGroup,
  TextIcon,
  UniversalSearchItem,
} from "../index_with_tw_base";

const meta = {
  title: "List/UniversalSearchItem",
  component: UniversalSearchItem,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
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
        visual={<Icon visual={TextIcon} size="md" />}
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
