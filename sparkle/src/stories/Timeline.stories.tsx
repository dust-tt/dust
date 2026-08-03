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

export const Default: Story = {
  render: () => (
    <div className="max-w-4xl space-y-8">
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
                <div className="mt-2 text-sm">Good stuff</div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Jules Belveze</div>
                <div className="text-xs text-muted-foreground">26 days ago</div>
                <div className="mt-2 text-sm">Test</div>
              </div>
            </Card>
          </div>
        </Timeline.Item>

        <Timeline.Item
          variant="upcoming"
          title="Version: October 24, 2025 at 1:48:53 PM"
          meta="In review"
          description="You are reviewing feedback for this version."
        >
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Jules Belveze</div>
                <div className="text-xs text-muted-foreground">27 days ago</div>
                <div className="mt-2 text-sm">Clear and concise brother</div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Jules Belveze</div>
                <div className="text-xs text-muted-foreground">27 days ago</div>
                <div className="mt-2 text-sm">Good stuff brother</div>
              </div>
            </Card>
          </div>
        </Timeline.Item>

        <Timeline.Item
          variant="upcoming"
          title="Version: September 30, 2025 at 1:21:09 PM"
          meta="Archived"
          description="Older feedback is still available for reference."
        >
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">ilias@dust.tt</div>
                <div className="text-xs text-muted-foreground">1 month ago</div>
                <div className="mt-2 text-sm">View conversation</div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">okal@dust.tt</div>
                <div className="text-xs text-muted-foreground">1 month ago</div>
                <div className="mt-2 text-sm">View conversation</div>
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
                <div className="text-sm font-medium">Sarah Chen</div>
                <div className="text-xs text-muted-foreground">
                  2 months ago
                </div>
                <div className="mt-2 text-sm">
                  Performance improvements are impressive!
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Mike Johnson</div>
                <div className="text-xs text-muted-foreground">
                  2 months ago
                </div>
                <div className="mt-2 text-sm">Great work on this release</div>
              </div>
            </Card>
          </div>
        </Timeline.Item>

        <Timeline.Item
          variant="current"
          title="Version: August 28, 2025 at 3:15:22 PM"
          meta="In progress"
          description="Bug fixes and minor updates being reviewed."
        >
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Anna Smith</div>
                <div className="text-xs text-muted-foreground">
                  3 months ago
                </div>
                <div className="mt-2 text-sm">
                  Found a few edge cases to handle
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Tom Brown</div>
                <div className="text-xs text-muted-foreground">
                  3 months ago
                </div>
                <div className="mt-2 text-sm">Needs more testing</div>
              </div>
            </Card>
          </div>
        </Timeline.Item>

        <Timeline.Item
          variant="complete"
          title="Version: August 10, 2025 at 9:45:00 AM"
          meta="Deployed"
          description="Initial release with core functionality."
        >
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Alex Martinez</div>
                <div className="text-xs text-muted-foreground">
                  3 months ago
                </div>
                <div className="mt-2 text-sm">Solid foundation</div>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">Lisa Wang</div>
                <div className="text-xs text-muted-foreground">
                  3 months ago
                </div>
                <div className="mt-2 text-sm">
                  Looking forward to next iteration
                </div>
              </div>
            </Card>
          </div>
        </Timeline.Item>
      </Timeline>
    </div>
  ),
};
