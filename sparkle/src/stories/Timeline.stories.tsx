import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Card, Timeline } from "../index_with_tw_base";

const meta = {
  title: "Components/Timeline",
  component: Timeline,
  tags: ["autodocs"],
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="s-max-w-4xl s-space-y-8">
      <Timeline>
        <Timeline.Item
          variant="upcoming"
          title="Version: October 30, 2025 at 1:36:44 PM"
          meta="4 feedback items"
          description="Latest production version. All feedback is processed."
        >
          <div className="s-grid s-gap-3 s-pt-2 sm:s-grid-cols-2">
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Jules Belveze</div>
                <div className="s-text-xs s-text-muted-foreground">
                  24 days ago
                </div>
                <div className="s-mt-2 s-text-sm">Good stuff</div>
              </div>
            </Card>
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Jules Belveze</div>
                <div className="s-text-xs s-text-muted-foreground">
                  26 days ago
                </div>
                <div className="s-mt-2 s-text-sm">Test</div>
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
          <div className="s-grid s-gap-3 s-pt-2 sm:s-grid-cols-2">
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Jules Belveze</div>
                <div className="s-text-xs s-text-muted-foreground">
                  27 days ago
                </div>
                <div className="s-mt-2 s-text-sm">
                  Clear and concise brother
                </div>
              </div>
            </Card>
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Jules Belveze</div>
                <div className="s-text-xs s-text-muted-foreground">
                  27 days ago
                </div>
                <div className="s-mt-2 s-text-sm">Good stuff brother</div>
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
          <div className="s-grid s-gap-3 s-pt-2 sm:s-grid-cols-2">
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">ilias@dust.tt</div>
                <div className="s-text-xs s-text-muted-foreground">
                  1 month ago
                </div>
                <div className="s-mt-2 s-text-sm">View conversation</div>
              </div>
            </Card>
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">okal@dust.tt</div>
                <div className="s-text-xs s-text-muted-foreground">
                  1 month ago
                </div>
                <div className="s-mt-2 s-text-sm">View conversation</div>
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
          <div className="s-grid s-gap-3 s-pt-2 sm:s-grid-cols-2">
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Sarah Chen</div>
                <div className="s-text-xs s-text-muted-foreground">
                  2 months ago
                </div>
                <div className="s-mt-2 s-text-sm">
                  Performance improvements are impressive!
                </div>
              </div>
            </Card>
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Mike Johnson</div>
                <div className="s-text-xs s-text-muted-foreground">
                  2 months ago
                </div>
                <div className="s-mt-2 s-text-sm">
                  Great work on this release
                </div>
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
          <div className="s-grid s-gap-3 s-pt-2 sm:s-grid-cols-2">
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Anna Smith</div>
                <div className="s-text-xs s-text-muted-foreground">
                  3 months ago
                </div>
                <div className="s-mt-2 s-text-sm">
                  Found a few edge cases to handle
                </div>
              </div>
            </Card>
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Tom Brown</div>
                <div className="s-text-xs s-text-muted-foreground">
                  3 months ago
                </div>
                <div className="s-mt-2 s-text-sm">Needs more testing</div>
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
          <div className="s-grid s-gap-3 s-pt-2 sm:s-grid-cols-2">
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Alex Martinez</div>
                <div className="s-text-xs s-text-muted-foreground">
                  3 months ago
                </div>
                <div className="s-mt-2 s-text-sm">Solid foundation</div>
              </div>
            </Card>
            <Card>
              <div className="s-flex s-flex-col s-gap-1">
                <div className="s-text-sm s-font-medium">Lisa Wang</div>
                <div className="s-text-xs s-text-muted-foreground">
                  3 months ago
                </div>
                <div className="s-mt-2 s-text-sm">
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
