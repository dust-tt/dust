import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Card, Timeline } from "../index_with_tw_base";

const meta = {
  title: "Data Display/Timeline",
  component: Timeline,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Displays a vertical sequence of events with connecting markers. Each **Timeline.Item** takes a **title**, optional **meta** and **description**, a **variant** (\`upcoming\`, \`current\`, \`complete\`) that styles its marker, and arbitrary children for richer content.

**When to use**
- To show ordered, time-based progressions such as version history, activity feeds, or process steps.

**Guidelines**
- Use the **variant** to convey state (\`complete\` for done, \`current\` for in-progress, \`upcoming\` for pending).
- Keep item content focused; for grouped detail, nest **Card** elements inside the item as shown.`,
      },
    },
  },
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A realistic agent version-history feed: each version is a Timeline.Item
 * with a title, meta, and description, its marker variant reflecting the
 * version's state, and feedback rendered as nested Cards.
 * @summary Realistic version-history feed.
 */
export const VersionHistory: Story = {
  render: () => (
    <div className="max-w-4xl">
      <Timeline>
        <Timeline.Item
          variant="upcoming"
          title="Version: October 30, 2025 at 1:36:44 PM"
          meta="4 feedback items"
          description="Latest production version. All feedback is processed."
        >
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Jules Belveze</div>
                <div className="text-xs text-muted-foreground">24 days ago</div>
                <div className="mt-2 text-sm">
                  Answers are much more precise now
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Sarah Chen</div>
                <div className="text-xs text-muted-foreground">26 days ago</div>
                <div className="mt-2 text-sm">Citations finally resolve</div>
              </div>
            </Card>
          </div>
        </Timeline.Item>

        <Timeline.Item
          variant="current"
          title="Version: October 24, 2025 at 1:48:53 PM"
          meta="In review"
          description="You are reviewing feedback for this version."
        >
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Mike Johnson</div>
                <div className="text-xs text-muted-foreground">27 days ago</div>
                <div className="mt-2 text-sm">Found a few edge cases</div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Anna Smith</div>
                <div className="text-xs text-muted-foreground">27 days ago</div>
                <div className="mt-2 text-sm">Needs more testing</div>
              </div>
            </Card>
          </div>
        </Timeline.Item>

        <Timeline.Item
          variant="complete"
          title="Version: September 15, 2025 at 10:30:00 AM"
          meta="Released"
          description="Major feature update with performance improvements."
        >
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Alex Martinez</div>
                <div className="text-xs text-muted-foreground">
                  2 months ago
                </div>
                <div className="mt-2 text-sm">
                  Performance improvements are impressive
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Lisa Wang</div>
                <div className="text-xs text-muted-foreground">
                  2 months ago
                </div>
                <div className="mt-2 text-sm">Great work on this release</div>
              </div>
            </Card>
          </div>
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};

/**
 * The three marker variants side by side: `complete` (filled highlight),
 * `current` (highlight ring), and `upcoming` (neutral ring). The connector
 * line inherits the variant color too.
 * @summary The three marker variants.
 */
export const MarkerVariants: Story = {
  render: () => (
    <div className="max-w-lg">
      <Timeline>
        <Timeline.Item
          variant="complete"
          title="Data sources connected"
          meta="Done"
          description="Notion and Slack are synced."
        />
        <Timeline.Item
          variant="current"
          title="Agent instructions"
          meta="In progress"
          description="Drafting the system prompt."
        />
        <Timeline.Item
          variant="upcoming"
          title="Publish to workspace"
          meta="Pending"
          description="Share the agent with your team."
        />
      </Timeline>
    </div>
  ),
};

/**
 * Timeline items accept arbitrary children, so richer content such as
 * **Card** elements can be nested under an item for grouped detail.
 * @summary Cards nested inside an item.
 */
export const WithCardContent: Story = {
  render: () => (
    <div className="max-w-2xl">
      <Timeline>
        <Timeline.Item
          variant="current"
          title="Version: October 24, 2025"
          meta="2 feedback items"
          description="Feedback collected on this version."
        >
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Jules Belveze</div>
                <div className="text-xs text-muted-foreground">3 days ago</div>
                <div className="mt-2 text-sm">Clear and concise answers</div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Sarah Chen</div>
                <div className="text-xs text-muted-foreground">5 days ago</div>
                <div className="mt-2 text-sm">Retrieval feels faster</div>
              </div>
            </Card>
          </div>
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};

/**
 * The **bounded** prop (default `true`) stops the connector line at the last
 * item. Set it to `false` when the timeline is a window into a longer feed
 * and the line should run past the final visible item.
 * @summary Connector line past the last item.
 */
export const Bounded: Story = {
  args: {
    bounded: false,
  },
  render: (args) => (
    <div className="max-w-lg">
      <Timeline {...args}>
        <Timeline.Item
          variant="complete"
          title="Workspace created"
          meta="Day 1"
        />
        <Timeline.Item
          variant="complete"
          title="First agent published"
          meta="Day 3"
        />
        <Timeline.Item
          variant="current"
          title="Team onboarding"
          meta="Today"
          description="More activity continues below the fold."
        />
      </Timeline>
    </div>
  ),
};
